/**
 * Shim for SillyTavern's `/scripts/popup.js`, mapped via the import map in
 * standalone/index.html. Backed by the standalone popup adapter.
 */

import { Popup as AdapterPopup } from '../adapters/popup-adapter.js';

export const POPUP_TYPE = {
    TEXT: 1,
    CONFIRM: 2,
    INPUT: 3,
    DISPLAY: 4,
};

export const POPUP_RESULT = {
    AFFIRMATIVE: 1,
    NEGATIVE: 0,
    CANCELLED: null,
};

/**
 * ST-compatible callGenericPopup: resolves to POPUP_RESULT.AFFIRMATIVE when
 * confirmed, POPUP_RESULT.CANCELLED otherwise.
 */
export async function callGenericPopup(content, type = POPUP_TYPE.TEXT, title = '', options = {}) {
    const isConfirm = type === POPUP_TYPE.CONFIRM;
    const popup = new AdapterPopup(content, 'TEXT', title, {
        okButton: options.okButton ?? true,
        cancelButton: options.cancelButton ?? isConfirm,
        wide: !!options.wide,
        large: !!options.large,
    });
    const result = await popup.show();
    return result ? POPUP_RESULT.AFFIRMATIVE : POPUP_RESULT.CANCELLED;
}

export { AdapterPopup as Popup };
