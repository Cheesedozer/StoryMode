/**
 * Event Handlers Module
 * Handles message events, arc progression, and completion tasks
 */

import {
    chat,
    generateRaw,
    addOneMessage,
    system_message_types,
    deactivateSendButtons,
    activateSendButtons,
    updateMessageBlock,
} from '/script.js';

import { extension_settings, getContext } from '/scripts/extensions.js';

import {
    MODULE_NAME,
    getChatStoryState,
    saveChatStoryState,
    getCurrentSceneIndex,
    setCurrentSceneIndex,
    getPacingMode,
} from './state-manager.js';

import {
    updateStoryPrompt,
} from './arc-engine.js';

import * as BlueprintModule from '../blueprint/module.js';
import { getBlueprintState, saveBlueprintState } from '../blueprint/storage.js';
import * as SceneImageGenerator from '../scene/image-generator.js';
import { showImagePreviewPopup } from '../scene/image-preview.js';
import { resetBeatProgress } from '../scenario/beats.js';
import { sendRequestWithReasoningRetry } from '../generation/orchestration.js';

/**
 * Re-render a message after its signal markers were stripped.
 * Uses the host's own renderer so markdown/formatting survives (and so hosts
 * like SillyBunny that defer or lifecycle-manage message updates stay in sync).
 * @param {number} messageId - Message ID
 * @param {Object} message - Chat message object (already cleaned)
 */
async function updateMessageDisplay(messageId, message) {
    try {
        await updateMessageBlock(messageId, message);
    } catch (error) {
        console.warn('[Story Mode] Could not re-render message after stripping signals:', error);
    }
}

// Re-export for external access
export {
    onMessageReceived,
    onUserMessageRendered,
    handleUserMessageStep,
    handleAIMessageChecks,
    handleArcCompletion,
    pushStoryMessage,
    generateEpilogueForStory,
    summarizeChatMainForStory,
    generateNextAdventureForStory,
    formatNextAdventureMessage,
    getStoryTextToSummarize,
    STORY_SUMMARY_PROMPT,
    setRegenerating,
    setLoadingChat,
    isRegenerating,
    isLoadingChat,
};

// Import toastr from window (it's globally available in SillyTavern)
const toastr = window.toastr;

// Track regeneration and loading state
let isRegenerating = false;
let isLoadingChat = false;

/**
 * Check if message handlers should skip processing
 * Common early exit checks for onMessageReceived and onUserMessageRendered
 * @returns {boolean} True if handler should skip processing
 */
function shouldSkipMessageHandler() {
    const settings = extension_settings[MODULE_NAME];

    if (!settings.enabled) {
        console.debug('[Story Mode] Skipping (extension disabled)');
        return true;
    }
    if (!settings.storyArcEnabled) {
        console.debug('[Story Mode] Skipping (story arc disabled)');
        return true;
    }
    if (isLoadingChat) {
        console.debug('[Story Mode] Skipping action (chat is loading)');
        return true;
    }
    return false;
}

/**
 * Set the regenerating flag
 * @param {boolean} value - New value for isRegenerating
 */
function setRegenerating(value) {
    isRegenerating = value;
}

/**
 * Set the loading chat flag
 * @param {boolean} value - New value for isLoadingChat
 */
function setLoadingChat(value) {
    isLoadingChat = value;
}

/**
 * Jump to a specific round/scene in the story
 *
 * This enables users to navigate to any point in the story arc.
 * When jumping, the scene mode is switched to 'manual' so the scene
 * index is stored directly rather than auto-calculated from round position.
 *
 * @param {number} targetRound - Target round number (0-based)
 * @param {number} [targetScene=null] - Target scene index (optional, calculated if not provided)
 * @returns {Promise<Object>} { success: boolean, message: string }
 */
export async function jumpToRound(targetRound, targetScene = null) {
    const chatState = getChatStoryState();
    const blueprintState = getBlueprintState();

    // Validate bounds
    if (targetRound < 0 || targetRound > chatState.arcLength) {
        return { success: false, message: `Round ${targetRound} is out of bounds (0-${chatState.arcLength})` };
    }

    // Calculate scene if not provided and blueprint exists
    if (targetScene === null && blueprintState.blueprint) {
        const sceneCount = blueprintState.blueprint.scene_plan?.length || 1;
        targetScene = Math.floor((targetRound / chatState.arcLength) * sceneCount);
        // Clamp to valid range
        targetScene = Math.min(targetScene, sceneCount - 1);
    }

    // Update states
    blueprintState.sceneMode = 'manual';
    chatState.currentStep = targetRound;
    if (targetScene !== null) {
        setCurrentSceneIndex(targetScene);
    }

    // Save both states
    await saveChatStoryState(chatState);
    await saveBlueprintState(blueprintState);

    // Refresh prompt and UI
    updateStoryPrompt();
    refreshUI();

    const sceneInfo = targetScene !== null ? `, Scene ${targetScene + 1}` : '';
    return { success: true, message: `Jumped to round ${targetRound + 1}${sceneInfo}` };
}

/**
 * Refresh all UI components for Story Mode
 */
function refreshUI() {
    const updateFunctions = [
        window.updateStatusDisplay,
        window.updateWandMenuStatus,
        window.refreshBlueprintPreview
    ];
    updateFunctions.forEach(fn => fn?.());
}

/**
 * Parse story signals from text (StoryVerse architecture)
 * @param {string} text - Message text
 * @returns {Object} { cleanText, signals: Array<{type, value}> }
 */
function parseStorySignals(text) {
    const signals = [];
    let cleanText = text;
    const originalLength = text.length;

    // Pattern definitions. Tolerant of the small formatting drift models
    // commonly produce: spaces inside the markers, lowercase, "BEAT 2",
    // NEXT-SCENE / NEXT SCENE, and markers wrapped in backticks or bold.
    const wrap = (inner) => new RegExp(`[\`*]*@@\\s*${inner}\\s*@@[\`*]*`, 'gi');
    const patterns = [
        { type: 'BEAT', regex: wrap('BEAT\\s*[:#]?\\s*(\\d+)') },
        { type: 'SKIP', regex: wrap('SKIP\\s*[:#]?\\s*(\\d+)') },
        { type: 'NEXT_SCENE', regex: wrap('NEXT[\\s_-]?SCENE') },
        { type: 'STORY_COMPLETE', regex: wrap('STORY[\\s_-]?COMPLETE') },
    ];

    patterns.forEach(p => {
        const matches = [...cleanText.matchAll(p.regex)];
        matches.forEach(m => {
            const signalPosition = m.index;
            const signalPercent = originalLength > 0 ? (signalPosition / originalLength) * 100 : 0;

            // Warn if signal appears before 90% of message
            if (signalPercent < 90) {
                console.warn(`[Story Mode] Mid-message signal detected: ${m[0]} at ${signalPercent.toFixed(1)}% of message (position ${signalPosition}/${originalLength})`);
                console.warn('[Story Mode] Signals should be placed at the END of responses');
            }

            signals.push({ type: p.type, value: m[1], position: signalPosition });
        });
        cleanText = cleanText.replace(p.regex, '');
    });

    return { cleanText: cleanText.trim(), signals };
}

/**
 * Process all story signals in a message
 * @param {Object} message - Message object
 * @param {number} messageId - Message ID
 * @param {Object} blueprintState - Blueprint state
 * @returns {boolean} True if any signals were processed
 */
async function processStorySignals(message, messageId, blueprintState) {
    console.log('[Story Mode] processStorySignals called for message', messageId);
    console.log('[Story Mode] Message text length:', message.mes?.length);

    const { cleanText, signals } = parseStorySignals(message.mes);

    console.log('[Story Mode] Signals found:', signals.length, signals);

    if (signals.length === 0) {
        console.log('[Story Mode] No signals to process');
        return false;
    }

    const settings = extension_settings[MODULE_NAME];

    // Update message text first (and the active swipe, so swiping back
    // and forth doesn't resurrect the markers)
    message.mes = cleanText;
    if (Array.isArray(message.swipes) && typeof message.swipe_id === 'number' && message.swipes[message.swipe_id] !== undefined) {
        message.swipes[message.swipe_id] = cleanText;
    }
    await updateMessageDisplay(messageId, message);
    console.log('[Story Mode] Message text updated, signals stripped');

    // Process signals
    let sceneAdvanced = false;
    let beatsUpdated = false;
    const currentSceneIndex = getCurrentSceneIndex();

    for (const signal of signals) {
        if (signal.type === 'BEAT') {
            const beatIndex = parseInt(signal.value);
            console.log('[Story Mode] Processing @@BEAT:', beatIndex);
            // markBeatCompleted handles both authoritative state (scenario.beatState)
            // and legacy sync (blueprintState.beatProgress)
            await BlueprintModule.markBeatCompleted(currentSceneIndex, beatIndex);
            beatsUpdated = true;
        }
        else if (signal.type === 'SKIP') {
            const beatIndex = parseInt(signal.value);
            console.log('[Story Mode] Processing @@SKIP:', beatIndex);
            // markBeatSkipped handles authoritative state (scenario.beatState)
            await BlueprintModule.markBeatSkipped(currentSceneIndex, beatIndex);
            beatsUpdated = true;
        }
        else if (signal.type === 'NEXT_SCENE' && !sceneAdvanced) {
            sceneAdvanced = true; // Only advance once per message
            const { blueprint } = blueprintState;
            const oldSceneIndex = currentSceneIndex; // Save old scene index before advancing
            const newSceneIndex = BlueprintModule.advanceSceneIndex(currentSceneIndex, 1, blueprint.scene_plan.length);
            const newScene = blueprint.scene_plan[newSceneIndex];
            console.log('[Story Mode] Scene advancing:', { from: oldSceneIndex, to: newSceneIndex, sceneTitle: newScene?.title });
            setCurrentSceneIndex(newSceneIndex);
            await saveBlueprintState(blueprintState);

            // Trigger summarization for the OLD scene we just left (fire-and-forget)
            if (settings.blueprintSettings?.summarizationEnabled) {
                console.log('[Story Mode] Checking if scene', oldSceneIndex, 'needs summarization');
                BlueprintModule.triggerSummarizationIfNeeded(oldSceneIndex, blueprintState, settings);
            }

            // Reset beats for new scene (resets both authoritative and legacy state)
            console.log('[Story Mode] Resetting beat progress for scene', newSceneIndex);
            await resetBeatProgress(newSceneIndex);

            // Log the new scene's beats for debugging
            if (newScene?.beats) {
                console.log('[Story Mode] New scene beats:', newScene.beats.map((b, idx) => `Beat ${idx}: ${b.title || b}`));
                console.log('[Story Mode] Beat 0 should now be the active beat (marked → in UI)');
            }

            // Auto-generate scene image if enabled
            if (settings.imageGeneration?.enabled && settings.imageGeneration?.autoGenerate) {
                if (newScene) {
                    console.log('[Story Mode] Auto-generating scene image for scene', newSceneIndex);
                    // Don't await - generate in background to avoid blocking scene transition
                    SceneImageGenerator.generateSceneImage(newScene, blueprint)
                        .then(result => {
                            if (result.success) {
                                console.log('[Story Mode] Scene image auto-generated successfully');
                                if (window.toastr) toastr.success(`Scene ${newSceneIndex + 1} image generated`);
                                // Show the generated image in preview popup
                                showImagePreviewPopup(newSceneIndex);
                            } else {
                                console.warn('[Story Mode] Scene image auto-generation failed:', result.error);
                            }
                        })
                        .catch(err => {
                            console.error('[Story Mode] Scene image auto-generation error:', err);
                        });
                } else {
                    console.warn('[Story Mode] Cannot auto-generate: newScene is null');
                }
            }

            refreshUI();
        }
        else if (signal.type === 'STORY_COMPLETE') {
            console.log('[Story Mode] @@STORY_COMPLETE@@ signal detected');
            const chatState = getChatStoryState();
            console.log('[Story Mode] Current state:', { currentStep: chatState.currentStep, arcLength: chatState.arcLength, epilogueShown: chatState.epilogueShown, summaryShown: chatState.summaryShown, endNoticeShown: chatState.endNoticeShown });
            chatState.currentStep = chatState.arcLength; // Force completion
            await saveChatStoryState(chatState);
            console.log('[Story Mode] Calling handleArcCompletion...');
            await handleArcCompletion(chatState, settings);
            console.log('[Story Mode] handleArcCompletion completed');
        }
    }

    // Refresh UI if beats were updated (but scene didn't advance, which already refreshes)
    if (beatsUpdated && !sceneAdvanced) {
        console.log('[Story Mode] Refreshing UI after beat updates');
        refreshUI();
    }

    console.log('[Story Mode] Signal processing complete');
    return true;
}

/**
 * Hook: After AI/character message is received
 *
 * Note: MESSAGE_RECEIVED only fires for AI messages in SillyTavern.
 * User messages fire USER_MESSAGE_RENDERED instead.
 * This handler only processes AI messages for arc completion and beat tracking.
 *
 * @param {number} messageId - Message ID in the chat array
 */
async function onMessageReceived(messageId) {
    if (shouldSkipMessageHandler()) return;

    // AI message - check for arc completion and beat markers
    await handleAIMessageChecks({ mesId: messageId });
}

/**
 * Hook: After user message is rendered
 *
 * USER_MESSAGE_RENDERED fires when a user submits a message.
 * This is where we increment the round counter.
 *
 * @param {number} messageId - Message ID in the chat array
 */
async function onUserMessageRendered(messageId) {
    if (shouldSkipMessageHandler()) return;

    // User submitted a message - this starts a new round
    await handleUserMessageStep({ mesId: messageId });
}

/**
 * Handle user message submission - increment round counter
 *
 * When a user submits a message, a new round begins. The round counter
 * is incremented unless the arc length has been reached, in which case
 * arc completion tasks are triggered instead.
 *
 * @param {Object} data - Message data from MESSAGE_RECEIVED event
 */
async function handleUserMessageStep(data) {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const pacingMode = getPacingMode();

    // Don't increment during regeneration
    if (isRegenerating) {
        console.debug('[Story Mode] Skipping round increment (regeneration detected)');
        isRegenerating = false;
        return;
    }

    // Scenario Mode does NOT use round-based tracking
    if (pacingMode === 'scenario') {
        console.debug('[Story Mode] Skipping round increment (Scenario Mode uses beat/scene tracking)');
        updateStoryPrompt();  // Still update prompt for any active features
        return;
    }

    // Story Mode with arc tracking disabled: update prompts but don't increment rounds
    if (!settings.storyArcEnabled) {
        console.debug('[Story Mode] Skipping round increment (arc tracking disabled)');
        updateStoryPrompt();  // Update prompts for genre/author style
        return;
    }

    // Story Mode with arc tracking enabled: Check completion and increment
    if (chatState.currentStep >= chatState.arcLength) {
        await handleArcCompletion(chatState, settings);
        return;
    }

    // Increment round (Story Mode with arc enabled only)
    chatState.currentStep++;

    // Update prompt immediately to assure the prompt is ready before ST generation (fixes race condition)
    updateStoryPrompt();

    await saveChatStoryState(chatState);

    // Track message for scene summarization
    if (settings.blueprintSettings?.enabled && settings.blueprintSettings?.useScenePrompts) {
        const blueprintState = getBlueprintState();
        if (blueprintState?.blueprint && blueprintState.useBlueprint) {
            const messageId = data?.mesId ?? (chat?.length > 0 ? chat.length - 1 : 0);
            BlueprintModule.trackMessageForScene(messageId, blueprintState, chatState.currentStep, chatState.arcLength);
        }
    }

    refreshUI();
}

/**
 * Handle AI message - check for arc completion
 *
 * AI messages do not increment the round counter. However, after the arc
 * is complete, AI messages may trigger arc completion tasks (epilogue/summary).
 *
 * @param {Object} data - Message data from MESSAGE_RECEIVED event
 */
async function handleAIMessageChecks(data) {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const pacingMode = getPacingMode();

    // Process Scenario Mode signals (@@BEAT:N@@, @@NEXT_SCENE@@, etc.)
    if (pacingMode === 'scenario') {
        await processScenarioSignals(data);
    }

    // Only check for arc completion in Story Mode with arc tracking enabled
    if (pacingMode === 'story' &&
        settings.storyArcEnabled &&
        chatState.currentStep >= chatState.arcLength &&
        !chatState.endNoticeShown) {
        await handleArcCompletion(chatState, settings);
    }
    // Scenario Mode: Arc completion triggered by @@STORY_COMPLETE@@ signal only
    // Story Mode without arc: No arc completion
}

/**
 * Process Scenario Mode signals from AI messages
 * @param {Object} data - Message data
 */
async function processScenarioSignals(data) {
    const settings = extension_settings[MODULE_NAME];

    // Check for story signals in blueprint mode
    console.log('[Story Mode] handleAIMessageChecks - checking signal conditions');
    console.log('[Story Mode] Blueprint enabled:', settings.blueprintSettings?.enabled);
    console.log('[Story Mode] Scene prompts enabled:', settings.blueprintSettings?.useScenePrompts);

    if (settings.blueprintSettings?.enabled && settings.blueprintSettings?.useScenePrompts) {
        const blueprintState = getBlueprintState();
        console.log('[Story Mode] Blueprint state:', {
            hasBlueprint: !!blueprintState?.blueprint,
            useBlueprint: blueprintState?.useBlueprint
        });

        if (blueprintState?.blueprint && blueprintState.useBlueprint) {
            const messageId = data?.mesId ?? chat.length - 1;
            const message = chat[messageId];
            console.log('[Story Mode] Message check:', {
                messageId,
                hasMes: !!message?.mes,
                isUser: message?.is_user
            });

            if (message?.mes && !message.is_user) {
                console.log('[Story Mode] Processing story signals for message', messageId);
                try {
                    await processStorySignals(message, messageId, blueprintState);
                } catch (error) {
                    console.error('[Story Mode] Error processing story signals:', error);
                    if (toastr) toastr.error('Story Mode signal processing failed. Check console for details.');
                }
            } else {
                console.log('[Story Mode] Skipping signal processing: invalid message');
            }
        } else {
            console.log('[Story Mode] Skipping signal processing: no active blueprint');
        }
    } else {
        console.log('[Story Mode] Skipping signal processing: blueprints/scene prompts disabled');
    }
}

/**
 * Check if prerequisites are met for a completion task
 */
function arePrerequisitesMet(settings, chatState, task) {
    const epilogueDone = !settings.epilogueEnabled || chatState.epilogueShown;
    const summaryDone = !settings.summaryEnabled || chatState.summaryShown;
    const nextAdventureDone = !settings.nextAdventureEnabled || chatState.nextAdventureShown;

    if (task === 'summary') return epilogueDone;
    if (task === 'nextAdventure') return epilogueDone && summaryDone;
    if (task === 'endNotice') return epilogueDone && summaryDone && nextAdventureDone;
    return true;
}

/**
 * Completion task definitions. `savedKey` must match what Arc History reads
 * (controller-panel-arc-history.js) and what the wand menu writes.
 */
const COMPLETION_TASKS = {
    epilogue: { label: 'Epilogue', stateKey: 'epilogueShown', savedKey: 'savedEpilogue' },
    summary: { label: 'Summary', stateKey: 'summaryShown', savedKey: 'savedSummary' },
    nextAdventure: { label: 'What\'s Next', stateKey: 'nextAdventureShown', savedKey: 'savedNextAdventure' },
};

/**
 * Build saved content object for Arc History
 */
function buildSavedContent(taskId, result) {
    const timestamp = new Date().toISOString();
    if (taskId === 'nextAdventure') {
        return { themes: result.themes || [], scenarios: result.scenarios, timestamp };
    }
    return { text: result, timestamp };
}

/**
 * Process a single completion task (epilogue, summary, or next adventure)
 */
async function processCompletionTask(taskId, generatorFn, chatState, formatFn = null) {
    const { label, stateKey, savedKey } = COMPLETION_TASKS[taskId];
    console.log(`[Story Mode] Generating ${label}...`);
    const result = await generatorFn();

    if (!result || (taskId === 'nextAdventure' && !result.scenarios?.length)) {
        console.warn(`[Story Mode] ${label} generation returned empty - marking as attempted`);
        chatState[stateKey] = true;
        await saveChatStoryState(chatState);
        if (toastr) toastr.warning(`${label} generation failed. Continuing with arc completion.`);
        return;
    }

    console.log(`[Story Mode] ${label} generated, pushing to chat`);
    chatState[savedKey] = buildSavedContent(taskId, result);

    const messageText = formatFn ? formatFn(result) : result;
    await pushStoryMessage(messageText);
    chatState[stateKey] = true;
    await saveChatStoryState(chatState);
    console.log(`[Story Mode] ${label} complete`);
    await new Promise(resolve => setTimeout(resolve, 1000));
}

/**
 * Handle arc completion tasks (epilogue, summary, end notice)
 */
async function handleArcCompletion(chatState, settings) {
    console.log('[Story Mode] handleArcCompletion called');

    // Epilogue
    if (settings.epilogueEnabled && !chatState.epilogueShown) {
        await processCompletionTask('epilogue', generateEpilogueForStory, chatState);
    }

    // Summary
    if (settings.summaryEnabled && !chatState.summaryShown && arePrerequisitesMet(settings, chatState, 'summary')) {
        await processCompletionTask('summary', summarizeChatMainForStory, chatState);
    }

    // What's Next
    if (settings.nextAdventureEnabled && !chatState.nextAdventureShown && arePrerequisitesMet(settings, chatState, 'nextAdventure')) {
        await processCompletionTask('nextAdventure', generateNextAdventureForStory, chatState, formatNextAdventureMessage);
    }

    // End Notice
    const noneEnabled = !settings.epilogueEnabled && !settings.summaryEnabled && !settings.nextAdventureEnabled;
    const allComplete = arePrerequisitesMet(settings, chatState, 'endNotice');

    if ((noneEnabled || allComplete) && !chatState.endNoticeShown) {
        console.log('[Story Mode] Showing end notice');
        const NOTICE_TEXT = '**<center>You have reached the end of this story arc. ' +
            'Feel free to continue, or if you would like to start a new arc, ' +
            'click Reset Arc in the Story Mode settings.</center>**';
        await pushStoryMessage(NOTICE_TEXT);
        chatState.endNoticeShown = true;
        await saveChatStoryState(chatState);
    }

    console.log('[Story Mode] handleArcCompletion finished');
}

/**
 * Push a story message (epilogue or summary) into the chat
 *
 * @param {string} messageText - The message text to push
 */
async function pushStoryMessage(messageText) {
    const message = {
        is_user: false,
        mes: messageText, // LLM has already generated the heading
        is_system: false,
        name: 'Story Mode',
        force_avatar: 'img/quill.png', // Use server-relative path (quill icon for story/narrative)
        send_date: Date.now(),
        extra: {
            type: system_message_types.NARRATOR,
        },
    };

    // Push message to chat array first
    chat.push(message);

    // Render the message in the UI without swipe arrows
    addOneMessage(message, { scroll: true, showSwipes: false });

}

/**
 * Generate epilogue for the completed story arc
 * Uses the epilogueApi setting if configured, otherwise falls back to main API
 *
 * @returns {Promise<string>} The generated epilogue text
 */
async function generateEpilogueForStory() {
    const ctx = getContext();
    const { chat: contextChat } = ctx;
    const settings = extension_settings[MODULE_NAME];

    // Get the recent chat context for the epilogue
    const recentMessages = formatTranscript(contextChat.filter(m => !m.is_system && m.mes).slice(-20));

    if (!recentMessages.trim()) {
        console.warn('[Story Mode] No messages to create epilogue from');
        return '';
    }

    const systemPrompt = `You are writing the epilogue of a story that has just ended. Build it only from what happened in the transcript: show where the main characters ended up and what their choices cost or earned them. Resolve the threads the story itself raised, and leave open what the story left open. Keep the story's voice and tone.
Start your response with the heading "**Epilogue**" on its own line, then a blank line, then the epilogue.`;

    const userPrompt = `Based on the recent story context below, write an epilogue that wraps up this story arc:\n\n${recentMessages}`;

    // Check if a specific API profile is configured for epilogue generation
    const selectedProfileId = settings.epilogueApi;


    // Block send button and show generation state during epilogue generation
    deactivateSendButtons();
    try {
        if (selectedProfileId) {
            // Use ConnectionManagerRequestService with the selected profile
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            const result = await sendRequestWithReasoningRetry(
                selectedProfileId,
                messages,
                0, // Use default response length
                {
                    stream: false,
                    extractData: true,
                }
            );

            return (result.text || result.content || '').trim();
        } else {
            // Fall back to main API using generateRaw
            const epilogue = await generateRaw({
                prompt: userPrompt,
                systemPrompt: systemPrompt,
            });
            return epilogue?.trim() || '';
        }
    } catch (error) {
        console.error('[Story Mode] Epilogue generation failed and will not be retried:', error);
        console.error('[Story Mode] Epilogue generation error details:', {
            profileId: selectedProfileId,
            errorMessage: error.message,
            errorStack: error.stack,
        });
        return '';
    } finally {
        activateSendButtons();
    }
}

/**
 * Format chat messages as a speaker-labelled transcript, so summaries and
 * epilogues know who said and did what.
 * @param {Array<Object>} messages - Chat messages
 * @returns {string}
 */
function formatTranscript(messages) {
    return messages
        .map(m => (m.name ? `${m.name}: ${m.mes}` : m.mes))
        .join('\n\n');
}

/**
 * Story summary prompt template
 */
const STORY_SUMMARY_PROMPT = `
You are a summarization assistant for a fictional story. Provide a comprehensive summary of the story arc using at most {{words}} words.
Include:
- **Character Development**: How each major character has changed and grown
- **Key Events**: The most important moments in chronological order
- **Important Elements**: Significant objects, locations, and relationships
- **Major Themes**: The underlying themes and messages explored
- **Resolution Status**: What was resolved and what remains open
Format this as a clear, well-organized narrative summary. Use markdown formatting and section headings to organize the summary.
Start your response with the heading "**Story Arc Summary**" on its own line, followed by a blank line, then write the summary content with your subsection headings.
`;

/**
 * Next adventure prompt template
 */
const NEXT_ADVENTURE_PROMPT = `You're a story continuation assistant. Based on the completed arc, generate:

**Part 1: Key Themes for Continuation** (4-6 threads)
Identify unresolved plot threads, unresolved tensions, recurring motifs or running jokes, and character dynamics worth exploring. Each theme should have:
- A short title in the story's own tone
- 1-2 sentences on the hook and why it would pull the reader back in

**Part 2: Three Scenario Options**
Develop three distinct directions the story could go. Each scenario should:
- Have a compelling title
- A 2-3 sentence premise setting up the situation
- 2-3 specific story hooks (moments, questions, or conflicts to explore)
- A tone indicator (e.g., "romantic comedy", "dramatic tension", "cozy chaos")

Format as JSON:
{
  "themes": [
    { "title": "...", "description": "..." }
  ],
  "scenarios": [
    { "title": "...", "premise": "...", "hooks": ["...", "..."], "tone": "..." }
  ]
}

Match the tone of the story so far. Be specific: name the actual characters, events, and objects from the story.`;

/**
 * Get story text to summarize based on settings
 *
 * @returns {string} The story text to summarize
 */
function getStoryTextToSummarize() {
    const ctx = SillyTavern.getContext();
    const { chat } = ctx;
    const settings = extension_settings[MODULE_NAME];

    // Filter non-system messages
    const filteredMessages = chat.filter(m => !m.is_system && m.mes);

    // Use either entire chat (if 0) or last N messages
    const messagesToSummarize = settings.summaryMessageCount === 0
        ? filteredMessages // Entire chat
        : filteredMessages.slice(-settings.summaryMessageCount); // Last N messages

    return formatTranscript(messagesToSummarize);
}

/**
 * Summarize the chat main for story
 * Uses the summaryApi setting if configured, otherwise falls back to main API
 *
 * @returns {Promise<string>} The generated summary text
 */
async function summarizeChatMainForStory() {
    const storyText = getStoryTextToSummarize();
    if (!storyText.trim()) {
        console.warn('[Story Mode] No text to summarize');
        return '';
    }

    const settings = extension_settings[MODULE_NAME];
    const words = settings.summaryWords ?? 500;
    const systemPrompt = STORY_SUMMARY_PROMPT.replace('{{words}}', String(words));

    // Check if a specific API profile is configured for summary generation
    const selectedProfileId = settings.summaryApi;

    // Block send button and show generation state during summary generation
    deactivateSendButtons();
    try {
        if (selectedProfileId) {
            // Use ConnectionManagerRequestService with the selected profile
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: storyText }
            ];

            const result = await sendRequestWithReasoningRetry(
                selectedProfileId,
                messages,
                settings.summaryMaxTokens ?? 0,
                {
                    stream: false,
                    extractData: true,
                }
            );

            return (result.text || result.content || '').trim();
        } else {
            // Fall back to main API using generateRaw
            const summary = await generateRaw({
                prompt: storyText,
                systemPrompt,
                responseLength: settings.summaryMaxTokens ?? 0,
            });

            return summary?.trim() || '';
        }
    } catch (error) {
        console.error('[Story Mode] Summary generation failed and will not be retried:', error);
        console.error('[Story Mode] Summary generation error details:', {
            profileId: selectedProfileId,
            errorMessage: error.message,
            errorStack: error.stack,
        });
        return '';
    } finally {
        activateSendButtons();
    }
}

/**
 * Build context text from chat history and summary
 */
function buildNextAdventureContext(chatState, contextChat) {
    let contextText = '';

    if (chatState.savedSummary?.text) {
        contextText += `**Story Arc Summary:**\n${chatState.savedSummary.text}\n\n---\n\n`;
    }

    const recentMessages = formatTranscript(contextChat.filter(m => !m.is_system && m.mes).slice(-30));

    if (!recentMessages.trim()) return null;

    contextText += `**Recent Story Context:**\n${recentMessages}`;
    return contextText;
}

/**
 * Clean up text that may have excessive quote characters from LLM output
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
function cleanupQuotes(text) {
    if (!text || typeof text !== 'string') return text;

    return text
        // Remove backslash-escaped quotes
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        // Replace multiple consecutive single quotes with one
        .replace(/'{2,}/g, "'")
        // Replace multiple consecutive double quotes with one
        .replace(/"{2,}/g, '"')
        // Normalize fancy/curly quotes to standard ones
        .replace(/[''`]/g, "'")
        .replace(/[""]/g, '"')
        .trim();
}

/**
 * Recursively clean quote characters from all string values in an object
 * @param {Object} obj - Object to clean
 * @returns {Object} Cleaned object
 */
function cleanupObjectQuotes(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        return obj.map(item => {
            if (typeof item === 'string') return cleanupQuotes(item);
            if (typeof item === 'object') return cleanupObjectQuotes(item);
            return item;
        });
    }

    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            cleaned[key] = cleanupQuotes(value);
        } else if (typeof value === 'object') {
            cleaned[key] = cleanupObjectQuotes(value);
        } else {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

/**
 * Parse JSON from LLM response (handles code blocks)
 */
function parseNextAdventureResponse(responseText) {
    if (!responseText) return null;

    let jsonText = responseText;
    const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonText = codeBlockMatch[1];

    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.themes || !parsed.scenarios || !Array.isArray(parsed.scenarios)) {
            console.error('[Story Mode] Invalid JSON structure:', parsed);
            return null;
        }
        // Clean up any excessive quotes in the parsed data
        return cleanupObjectQuotes(parsed);
    } catch (parseError) {
        console.error('[Story Mode] JSON parse error:', parseError);
        return null;
    }
}

/**
 * Generate next adventure options for the completed story arc
 * Uses the nextAdventureApi setting if configured, otherwise falls back to main API
 *
 * @returns {Promise<Object|null>} The generated options { themes, scenarios } or null on failure
 */
async function generateNextAdventureForStory() {
    const ctx = getContext();
    const { chat: contextChat } = ctx;
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();

    const contextText = buildNextAdventureContext(chatState, contextChat);
    if (!contextText) {
        console.warn('[Story Mode] No messages to create next adventure from');
        return null;
    }

    const userPrompt = `Based on the story context below, generate continuation options:\n\n${contextText}`;
    const selectedProfileId = settings.nextAdventureApi;

    console.log('[Story Mode] Generating next adventure with profile:', selectedProfileId || 'Default API');

    deactivateSendButtons();
    try {
        let responseText = '';

        if (selectedProfileId) {
            const messages = [
                { role: 'system', content: NEXT_ADVENTURE_PROMPT },
                { role: 'user', content: userPrompt }
            ];

            const result = await sendRequestWithReasoningRetry(
                selectedProfileId,
                messages,
                0,
                { stream: false, extractData: true }
            );

            responseText = (result.text || result.content || '').trim();
        } else {
            const result = await generateRaw({
                prompt: userPrompt,
                systemPrompt: NEXT_ADVENTURE_PROMPT,
            });
            responseText = result?.trim() || '';
        }

        const parsed = parseNextAdventureResponse(responseText);
        if (!parsed) {
            console.error('[Story Mode] Failed to parse next adventure response');
            return null;
        }

        console.log('[Story Mode] Successfully parsed next adventure:', {
            themes: parsed.themes?.length,
            scenarios: parsed.scenarios?.length
        });
        return parsed;
    } catch (error) {
        console.error('[Story Mode] Next adventure generation failed:', error);
        return null;
    } finally {
        activateSendButtons();
    }
}

/**
 * Format next adventure data as a chat message
 *
 * @param {Object} data - The next adventure data { themes, scenarios }
 * @returns {string} Formatted markdown message
 */
function formatNextAdventureMessage(data) {
    let message = '**🗝️ Key Themes for Continuation:**\n\n';

    if (data.themes && Array.isArray(data.themes)) {
        data.themes.forEach((theme, idx) => {
            message += `${idx + 1}. **${theme.title}** – ${theme.description}\n`;
        });
    }

    message += '\n---\n\n**🎭 Scenario Options:**\n\n';

    if (data.scenarios && Array.isArray(data.scenarios)) {
        data.scenarios.forEach((scenario, idx) => {
            message += `### ${idx + 1}. ${scenario.title}\n`;
            if (scenario.tone) {
                message += `*Tone: ${scenario.tone}*\n\n`;
            }
            message += `${scenario.premise}\n\n`;
            if (scenario.hooks && Array.isArray(scenario.hooks)) {
                message += '**Hooks:**\n';
                scenario.hooks.forEach(hook => {
                    message += `- ${hook}\n`;
                });
            }
            message += '\n';
        });
    }

    return message;
}
