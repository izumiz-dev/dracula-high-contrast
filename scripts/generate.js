const { readFile } = require('fs').promises;
const { join } = require('path');
const { Type, DEFAULT_SCHEMA, load } = require('js-yaml');
const tinycolor = require('tinycolor2');

/**
 * @typedef {Object} TokenColor - Textmate token color.
 * @prop {string} [name] - Optional name.
 * @prop {string[]} scope - Array of scopes.
 * @prop {Record<'foreground'|'background'|'fontStyle',string|undefined>} settings - Textmate token settings.
 *       Note: fontStyle is a space-separated list of any of `italic`, `bold`, `underline`.
 */

/**
 * @typedef {Object} Theme - Parsed theme object.
 * @prop {Record<'base'|'ansi'|'brightOther'|'other', string[]>} dracula - Dracula color variables.
 * @prop {Record<string, string|null|undefined>} colors - VSCode color mapping.
 * @prop {TokenColor[]} tokenColors - Textmate token colors.
 */

/**
 * @typedef {(yamlObj: Theme) => Theme} ThemeTransform
 */

const withAlphaType = new Type('!alpha', {
    kind: 'sequence',
    construct: ([hexRGB, alpha]) => hexRGB + alpha,
    represent: ([hexRGB, alpha]) => hexRGB + alpha,
});

const schema = DEFAULT_SCHEMA.extend([withAlphaType]);

/**
 * Soft variant transform.
 * @type {ThemeTransform}
 */
const transformSoft = theme => {
    /** @type {Theme} */
    const soft = JSON.parse(JSON.stringify(theme));
    const brightColors = [...soft.dracula.ansi, ...soft.dracula.brightOther];
    for (const key of Object.keys(soft.colors)) {
        if (brightColors.includes(soft.colors[key])) {
            soft.colors[key] = tinycolor(soft.colors[key])
                .desaturate(20)
                .toHexString();
        }
    }
    soft.tokenColors = soft.tokenColors.map((value) => {
        if (brightColors.includes(value.settings.foreground)) {
            value.settings.foreground = tinycolor(value.settings.foreground).desaturate(20).toHexString();
        }
        return value;
    })
    return soft;
};

/**
 * High Contrast variant transform.
 * @type {ThemeTransform}
 */
const transformHighContrast = theme => {
    /** @type {Theme} */
    const hc = JSON.parse(JSON.stringify(theme));

    // Dracula Palette (referenced from base.dracula.base)
    // We want to keep syntax colors but force strict background/foreground
    const FG = '#FFFFFF';
    const BG = '#000000';
    const SELECTION = '#000099'; // High blue for selection like default HC
    // Or keep Dracula selection but ensure high visibility? Default HC uses simple colors.
    // Let's stick to Dracula's identity but cleaner.

    // 1. Force Backgrounds to Black
    const bgKeys = [
        'activityBar.background',
        'breadcrumb.background',
        'debugToolBar.background',
        'editor.background',
        'editorGutter.background',
        'editorGroup.background',
        'editorGroupHeader.tabsBackground', // "No Tabs" background
        'editorGroupHeader.noTabsBackground',
        'editorHoverWidget.background',
        'editorMarkerNavigation.background',
        'editorSuggestWidget.background',
        'editorWidget.background',
        'input.background',
        'list.activeSelectionBackground', // Often inverted in HC, but let's try black + border
        'list.dropBackground',
        'list.focusBackground',
        'list.hoverBackground',
        'list.inactiveSelectionBackground',
        'menu.background',
        'panel.background',
        'peekViewEditor.background',
        'peekViewResult.background',
        'peekViewTitle.background',
        'pickerGroup.border', // Quick pick grouping
        'quickInput.background',
        'scrollbarSlider.background',
        'scrollbarSlider.hoverBackground',
        'scrollbarSlider.activeBackground',
        'settings.checkboxBackground',
        'settings.dropdownBackground',
        'settings.numberInputBackground',
        'settings.textInputBackground',
        'sideBar.background',
        'sideBarSectionHeader.background',
        'statusBar.background',
        'statusBar.noFolderBackground',
        'statusBar.debuggingBackground',
        'tab.activeBackground',
        'tab.inactiveBackground',
        'tab.unfocusedActiveBackground',
        'terminal.background',
        'titleBar.activeBackground',
        'titleBar.inactiveBackground',
        'walkThrough.embeddedEditorBackground',
        'welcomePage.background',
        'window.activeBorder', // Window border if supported
    ];

    for (const key of Object.keys(hc.colors)) {
        if (bgKeys.includes(key) || key.endsWith('background') || key.endsWith('Background')) {
            // EXEMPTIONS: specific keys we want to handle manually or keep colored
            if (key.includes('selection') || key.includes('Selection')) continue;
            if (key.includes('button')) continue;
            if (key.includes('Badge')) continue;
            if (key.includes('diffEditor')) continue;
            if (key.includes('merge')) continue;
            if (key.includes('highlight')) continue; // scrollbar highlights etc
            if (key.includes('OverviewRuler')) continue;

            // Otherwise, force to BLACK
            hc.colors[key] = '#000000';
        }
    }

    // Explicit Overrides
    const overrides = {
        // Core Colors
        'focusBorder': '#FFFFFF',
        'contrastBorder': '#FFFFFF',
        'contrastActiveBorder': '#FF79C6', // Dracula Pink for active focus

        // Base
        'editor.background': '#000000',
        'editor.foreground': '#FFFFFF',
        'foreground': '#FFFFFF',
        'descriptionForeground': '#FFFFFF',
        'errorForeground': '#FF5555', // Red

        // Selection - Hybrid Approach
        // Editor: Rigid High Contrast (White BG / Black Text) - supported by editor.selectionForeground
        'editor.selectionBackground': '#FFFFFF',
        'editor.selectionForeground': '#000000',

        // Global/Webview: Safe High Contrast (Data Blue BG / White Text)
        // Reason: Webviews/Walkthroughs do not support auto-inverting text color on selection,
        // so we must use a dark background to keep white text readable.
        'selection.background': '#000099',

        // Let's try to mimic "Dracula" content but "HC" container.
        'widget.shadow': '#000000',

        // Tabs
        'tab.activeBackground': '#000000',
        'tab.activeBorder': '#FF79C6',
        'tab.activeForeground': '#FFFFFF',
        'tab.border': '#FFFFFF',
        'tab.inactiveBackground': '#000000',
        'tab.inactiveForeground': '#FFFFFF',

        // Side Bar
        'sideBar.background': '#000000',
        'sideBar.border': '#FFFFFF',
        'sideBarTitle.foreground': '#FFFFFF',

        // Activity Bar
        'activityBar.background': '#000000',
        'activityBar.border': '#FFFFFF',
        'activityBar.foreground': '#FFFFFF',
        'activityBar.activeBorder': '#FF79C6',

        // Editor Groups
        'editorGroup.border': '#FFFFFF',
        'editorGroupHeader.tabsBackground': '#000000',
        'editorGroupHeader.tabsBorder': '#FFFFFF',

        // Panel
        'panel.background': '#000000',
        'panel.border': '#FFFFFF',
        'panelTitle.activeBorder': '#FF79C6', // Keep highlight
        'panelTitle.activeForeground': '#FFFFFF',
        'panelTitle.inactiveForeground': '#FFFFFF',

        // Title Bar
        'titleBar.activeBackground': '#000000',
        'titleBar.activeForeground': '#FFFFFF',
        'titleBar.inactiveBackground': '#000000',
        'titleBar.inactiveForeground': '#FFFFFF',
        'titleBar.border': '#FFFFFF',

        // Status Bar
        'statusBar.background': '#000000',
        'statusBar.border': '#FFFFFF',
        'statusBar.foreground': '#FFFFFF',
        'statusBar.debuggingBackground': '#000000', // Keep black in HC usually
        'statusBar.debuggingBorder': '#FF5555',

        // Terminal
        'terminal.background': '#000000',
        'terminal.border': '#FFFFFF',

        // Breadcrumbs
        'breadcrumb.background': '#000000',
        'breadcrumb.foreground': '#FFFFFF',
        'breadcrumbPicker.background': '#000000',

        // Sidebar Headers
        'sideBarSectionHeader.background': '#000000',
        'sideBarSectionHeader.foreground': '#FFFFFF',
        'sideBarSectionHeader.border': '#FFFFFF',

        // Buttons
        'button.background': '#000000',
        'button.foreground': '#FFFFFF',
        'button.border': '#FFFFFF',
        'button.separator': '#FFFFFF',
        'button.hoverBackground': '#44475A', // Dark Grey to ensure White text is visible (hoverForeground not supported)
        'button.secondaryBackground': '#000000',
        'button.secondaryForeground': '#FFFFFF',
        'button.secondaryHoverBackground': '#44475A', // Ensure secondary buttons also readable

        // Dropdowns & Quick Pick
        'dropdown.background': '#000000',
        'dropdown.border': '#FFFFFF',
        'dropdown.foreground': '#FFFFFF',
        'quickInput.background': '#000000',
        'pickerGroup.border': '#FFFFFF',
        'pickerGroup.foreground': '#FFFFFF',

        // Editor Widgets (Find/Replace, Suggestions, Hovers)
        'editorWidget.background': '#000000',
        'editorWidget.border': '#FFFFFF',
        'editorWidget.foreground': '#FFFFFF',
        'editorSuggestWidget.background': '#000000',
        'editorSuggestWidget.border': '#FFFFFF',
        'editorSuggestWidget.foreground': '#FFFFFF',
        'editorHoverWidget.background': '#000000',
        'editorHoverWidget.border': '#FFFFFF',
        'editorHoverWidget.foreground': '#FFFFFF',
        'debugToolBar.background': '#000000',
        'debugToolBar.border': '#FFFFFF',

        // Notifications
        'notificationCenter.border': '#FFFFFF',
        'notificationCenterHeader.background': '#000000',
        'notificationCenterHeader.foreground': '#FFFFFF',
        'notificationToast.border': '#FFFFFF',
        'notifications.background': '#000000',
        'notifications.foreground': '#FFFFFF',
        'notifications.border': '#FFFFFF',

        // Menus (Context Menu)
        'menu.background': '#000000',
        'menu.foreground': '#FFFFFF',
        'menu.selectionBackground': '#FFFFFF', // Inverted selection
        'menu.selectionForeground': '#000000',
        'menu.border': '#FFFFFF',
        'menu.separatorBackground': '#FFFFFF',

        // Peek Views
        'peekView.border': '#FFFFFF',
        'peekViewEditor.background': '#000000',
        'peekViewEditor.matchHighlightBackground': '#FFFFFF', // High contrast match
        'peekViewResult.background': '#000000',
        'peekViewResult.fileForeground': '#FFFFFF',
        'peekViewResult.lineForeground': '#FFFFFF',
        'peekViewResult.matchHighlightBackground': '#FFFFFF',
        'peekViewResult.selectionBackground': '#FFFFFF',
        'peekViewResult.selectionForeground': '#000000',
        'peekViewTitle.background': '#000000',
        'peekViewTitleDescription.foreground': '#FFFFFF',
        'peekViewTitleLabel.foreground': '#FFFFFF',

        // Settings
        'settings.checkboxBackground': '#000000',
        'settings.checkboxForeground': '#FFFFFF',
        'settings.checkboxBorder': '#FFFFFF',
        'settings.dropdownBackground': '#000000',
        'settings.dropdownForeground': '#FFFFFF',
        'settings.dropdownBorder': '#FFFFFF',
        'settings.headerForeground': '#FFFFFF',
        'settings.modifiedItemIndicator': '#FF79C6',
        'settings.numberInputBackground': '#000000',
        'settings.numberInputForeground': '#FFFFFF',
        'settings.numberInputBorder': '#FFFFFF',
        'settings.textInputBackground': '#000000',
        'settings.textInputForeground': '#FFFFFF',
        'settings.textInputBorder': '#FFFFFF',

        // Badges
        'activityBarBadge.background': '#000000',
        'activityBarBadge.foreground': '#FFFFFF',
        'badge.background': '#000000',
        'badge.foreground': '#FFFFFF',

        // Scrollbar
        'scrollbarSlider.background': '#FFFFFF60', // semi-transparent white
        'scrollbarSlider.activeBackground': '#FFFFFF',
        'scrollbarSlider.hoverBackground': '#FFFFFF',

        // Inputs
        'input.background': '#000000',
        'input.foreground': '#FFFFFF',
        'input.border': '#FFFFFF',

        // Diff Editor - Option B: Solid High Contrast Backgrounds + Borders
        'diffEditor.insertedTextBackground': '#003500', // Deep Solid Green
        'diffEditor.insertedTextBorder': '#50FA7B',     // Bright Green Border
        'diffEditor.removedTextBackground': '#350000',  // Deep Solid Red
        'diffEditor.removedTextBorder': '#FF5555',      // Bright Red Border

        // Merge Conflicts
        'merge.currentHeaderBackground': '#000000',
        'merge.currentContentBackground': '#000000',
        'merge.incomingHeaderBackground': '#000000',
        'merge.incomingContentBackground': '#000000',
        'merge.border': '#FFFFFF',
        'merge.commonHeaderBackground': '#000000',
        'merge.commonContentBackground': '#000000',

        // We probably also want colored borders for merge to distinguish
        // But VS Code might not support specific border colors for merge headers easily in same keys?
        // Let's check available keys.
        // merge.border handles the splitter.

        // List/Trees
        'list.activeSelectionBackground': '#000000',
        'list.activeSelectionForeground': '#FFFFFF',
        'list.focusOutline': '#FF79C6', // Active item border
        'list.hoverBackground': '#000000',
        'list.hoverForeground': '#FFFFFF',
        // 'list.inactiveSelectionBackground': '#000000',

        // Markdown / Chat UI / Inline Codes
        'textPreformat.foreground': '#FFFFFF',
        'textPreformat.background': '#282A36', // Use Dracula BG to distinguish from strict Black editor BG
        'textCodeBlock.background': '#000000',
        'textLink.foreground': '#8BE9FD',
        'textLink.activeForeground': '#8BE9FD',
        'textBlockQuote.background': '#000000',
        'textBlockQuote.border': '#FFFFFF',
        'textSeparator.foreground': '#FFFFFF',

        // Keybindings (e.g. [Ctrl+C])
        'keybindingLabel.background': '#000000',
        'keybindingLabel.foreground': '#FFFFFF',
        'keybindingLabel.border': '#FFFFFF',
        'keybindingLabel.bottomBorder': '#FFFFFF',
    };

    // Apply strict overrides
    Object.assign(hc.colors, overrides);

    // Remove any alpha-based colors in critical areas if they weren't overridden
    // Loop through colors and if they are alpha strings !alpha [...], replace with solid if possible or ensure contrast.

    // For now, the overrides cover the main requested "Diff/Conflict" areas by setting Background to black and adding Borders.

    return hc;
};

module.exports = async () => {
    const yamlFile = await readFile(
        join(__dirname, '..', 'src', 'dracula.yml'),
        'utf-8'
    );

    /** @type {Theme} */
    const base = load(yamlFile, { schema });

    // Remove nulls and other falsey values from colors
    for (const key of Object.keys(base.colors)) {
        if (!base.colors[key]) {
            delete base.colors[key];
        }
    }

    return {
        base,
        soft: transformSoft(base),
        hc: transformHighContrast(base),
    };
};
