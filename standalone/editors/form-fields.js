/**
 * Small form helper for the standalone editor's modals.
 *
 * Builds labelled inputs from a field spec and reads them back. Field kinds:
 *   text   single-line input
 *   area   textarea (rows)
 *   lines  textarea, one array item per line
 *   select dropdown ({ value, label } options)
 * Values are read back into a plain object keyed by field `key`, so callers
 * can merge them into the existing record and keep fields they don't edit.
 */

/**
 * @param {Array<Object>} fields - [{ key, label, kind, rows?, options?, help?, required? }]
 * @param {Object} values - Current values by key
 * @returns {jQuery} Form element
 */
export function buildForm(fields, values = {}) {
    const $form = $('<div>').addClass('modal-form');
    for (const field of fields) {
        const id = `ff-${field.key}-${Math.random().toString(36).slice(2, 7)}`;
        const value = values[field.key];
        const $group = $('<div>').addClass('form-group');
        const $label = $('<label>').attr('for', id).text(field.label);
        if (field.required) $label.append(' <span class="required">*</span>');
        $group.append($label);

        let $input;
        if (field.kind === 'select') {
            $input = $('<select>').addClass('form-control');
            (field.options || []).forEach(o => $input.append($('<option>').val(o.value).text(o.label)));
            $input.val(value ?? field.options?.[0]?.value ?? '');
        } else if (field.kind === 'text') {
            $input = $('<input type="text">').addClass('form-control').val(value ?? '');
        } else {
            const text = field.kind === 'lines' && Array.isArray(value) ? value.join('\n') : (value ?? '');
            $input = $('<textarea>').addClass('form-control').attr('rows', field.rows || 3).val(text);
        }
        $input.attr({ id, 'data-key': field.key, 'data-kind': field.kind });
        $group.append($input);
        if (field.help) $group.append($('<small>').addClass('text-muted').text(field.help));
        $form.append($group);
    }
    return $form;
}

/**
 * @param {jQuery} $form - Form built by buildForm
 * @returns {Object} Values by key
 */
export function readForm($form) {
    const out = {};
    $form.find('[data-key]').each(function () {
        const $input = $(this);
        const raw = $input.val() ?? '';
        out[$input.attr('data-key')] = $input.attr('data-kind') === 'lines'
            ? raw.split('\n').map(s => s.trim()).filter(Boolean)
            : raw.trim();
    });
    return out;
}
