import * as core from '@actions/core';
import { IncomingWebhook } from '@slack/webhook';
import { WebClient } from '@slack/web-api';
import { FormattedLighthouseResults, formatScore } from './utils';

interface TextObject {
    type: string;
    text: string;
    emoji?: boolean;
}

interface MrkdwnElement {
    type: 'mrkdwn';
    text: string;
}

interface SectionBlock {
    type: 'section';
    text?: TextObject;
    fields?: TextObject[];
    accessory?: any;
}

interface HeaderBlock {
    type: 'header';
    text: TextObject;
}

interface ContextBlock {
    type: 'context';
    elements: Array<MrkdwnElement | { type: string; text: string; }>;
}

interface DividerBlock {
    type: 'divider';
}

type SlackBlock = SectionBlock | HeaderBlock | DividerBlock | ContextBlock;

/**
 * Get emoji for a Lighthouse score using Unicode emoji
 */
function getScoreEmoji(score: number): string {
    if (score >= 0.9) return '🟢';
    if (score >= 0.5) return '🟡';
    return '🔴';
}

/**
 * Create a visual bar to represent score
 */
function createScoreBar(score: number): string {
    const fullBlocks = Math.floor(score * 10);
    const barChars = '█░';

    let bar = '';
    for (let i = 0; i < 10; i++) {
        bar += i < fullBlocks ? barChars[0] : barChars[1];
    }

    return bar;
}

/**
 * Get a description for a score
 */
function getScoreDescription(score: number): string {
    if (score >= 0.9) return 'Excellent';
    if (score >= 0.7) return 'Good';
    if (score >= 0.5) return 'Needs Improvement';
    return 'Poor';
}

/**
 * Pad a string to ensure consistent column widths
 */
function padColumn(text: string, width: number): string {
    if (text.length >= width) return text;
    return text + ' '.repeat(width - text.length);
}

/**
 * Format a table row with consistent column widths
 */
function formatTableRow(columns: string[], widths: number[]): string {
    let result = '';

    for (let i = 0; i < columns.length; i++) {
        const paddedColumn = padColumn(columns[i], widths[i]);

        if (i < columns.length - 1) {
            result += paddedColumn + ' | ';
        } else {
            result += paddedColumn;
        }
    }

    return result;
}

/**
 * Create a compact Slack message for the Lighthouse results with desktop/mobile scores side by side
 */
function createCompactSlackBlocks(
    results: FormattedLighthouseResults,
    title: string
): Array<SlackBlock> {
    core.debug('Creating compact Slack message blocks with table layout');

    const blocks: SlackBlock[] = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: title,
                emoji: true
            }
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Summary:* Tested ${results.summary.totalUrls} URLs on desktop and mobile devices`
            }
        }
    ];

    const resultsByUrl = new Map<string, Map<string, Map<string, number>>>();

    const allCategories = new Set<string>();

    results.results.forEach(result => {
        result.categories.forEach(category => {
            allCategories.add(category.id);
        });

        if (!resultsByUrl.has(result.url)) {
            resultsByUrl.set(result.url, new Map<string, Map<string, number>>());
        }

        const urlData = resultsByUrl.get(result.url)!;

        result.categories.forEach(category => {
            if (!urlData.has(category.id)) {
                urlData.set(category.id, new Map<string, number>());
            }
            urlData.get(category.id)!.set(result.deviceType, category.score);
        });
    });

    const sortedCategories = Array.from(allCategories).sort();

    const tableHeader = ['URL'];
    sortedCategories.forEach(category => {
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
        tableHeader.push(categoryName);
    });

    blocks.push({
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: '*Lighthouse Scores (Desktop / Mobile)*'
        }
    });

    let tableText = '```';

    tableText += 'URL'.padEnd(20);
    sortedCategories.forEach(category => {
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
        tableText += '| ' + categoryName.padEnd(16);
    });
    tableText += '\n';

    tableText += '─'.repeat(20);
    sortedCategories.forEach(() => {
        tableText += '|' + '─'.repeat(17);
    });
    tableText += '\n';

    resultsByUrl.forEach((urlData, url) => {
        const displayUrl = url.replace(/^https?:\/\//, '').substring(0, 18).padEnd(20);
        tableText += displayUrl;

        sortedCategories.forEach(category => {
            const categoryScores = urlData.get(category) || new Map<string, number>();
            const desktopScore = categoryScores.get('desktop') !== undefined
                ? Math.round(categoryScores.get('desktop')! * 100)
                : '-';
            const mobileScore = categoryScores.get('mobile') !== undefined
                ? Math.round(categoryScores.get('mobile')! * 100)
                : '-';

            const scoreDisplay = `${desktopScore} / ${mobileScore}`;
            tableText += '| ' + scoreDisplay.padEnd(16);
        });

        tableText += '\n';
    });

    tableText += '```';

    blocks.push({
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: tableText
        }
    });

    blocks.push({
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: 'Score Legend: 90-100: Excellent | 50-89: Needs Improvement | 0-49: Poor'
            }
        ]
    });

    if (results.summary.averageScores && Object.keys(results.summary.averageScores).length > 0) {
        let bestCategory = '';
        let bestScore = 0;
        let worstCategory = '';
        let worstScore = 1;

        for (const [category, score] of Object.entries(results.summary.averageScores)) {
            if (score > bestScore) {
                bestScore = score;
                bestCategory = category;
            }
            if (score < worstScore) {
                worstScore = score;
                worstCategory = category;
            }
        }

        if (bestCategory && worstCategory) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*Key Insights:*'
                }
            });

            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `• *Strongest Area:* ${bestCategory.charAt(0).toUpperCase() + bestCategory.slice(1)} at ${formatScore(bestScore)}\n• *Area for Improvement:* ${worstCategory.charAt(0).toUpperCase() + worstCategory.slice(1)} at ${formatScore(worstScore)}`
                }
            });
        }
    }

    blocks.push({
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: 'Detailed HTML reports available in GitHub Actions artifacts'
            }
        ]
    });

    blocks.push({
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: `Generated by Lighthouse CI Slack Reporter · ${new Date().toISOString()}`
            }
        ]
    });

    return blocks;
}

/**
 * Create a Slack message for the Lighthouse results with a horizontal, 4-column layout
 * This is the original detailed format - kept for reference and fallback
 */
function createDetailedSlackBlocks(
    results: FormattedLighthouseResults,
    title: string
): Array<SlackBlock> {
    core.debug('Creating detailed Slack message blocks with horizontal layout');

    const resultsByUrl: Record<string, any[]> = {};

    const COLUMN_WIDTHS = [18, 12, 15, 20];

    results.results.forEach(result => {
        if (!resultsByUrl[result.url]) {
            resultsByUrl[result.url] = [];
        }
        resultsByUrl[result.url].push(result);
    });

    const blocks: SlackBlock[] = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: title,
                emoji: true
            }
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Summary:* Tested ${results.summary.totalUrls} URLs with ${results.summary.totalTests} tests`
            }
        }
    ];

    blocks.push({
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: '*Average Scores Across All Tests:*'
        }
    });

    const headerTexts = ['*Category*', '*Score*', '*Visual*', '*Status*'];
    blocks.push({
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: '```' + formatTableRow(headerTexts, COLUMN_WIDTHS) + '```'
        }
    });

    for (const [category, score] of Object.entries(results.summary.averageScores)) {
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
        const emoji = getScoreEmoji(score);
        const percentage = Math.round(score * 100);
        const scoreText = `${emoji} ${percentage}%`;
        const bar = createScoreBar(score);
        const description = getScoreDescription(score);

        const rowTexts = [categoryName, scoreText, bar, description];

        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: '```' + formatTableRow(rowTexts, COLUMN_WIDTHS) + '```'
            }
        });
    }

    const deviceTypes = Object.keys(results.summary.scoresByDevice);
    if (deviceTypes.length > 1) {
        for (const deviceType of deviceTypes) {
            const deviceIcon = deviceType === 'mobile' ? '📱' : '💻';

            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Average Scores for ${deviceIcon} ${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}:*`
                }
            });

            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '```' + formatTableRow(headerTexts, COLUMN_WIDTHS) + '```'
                }
            });

            const deviceScores = results.summary.scoresByDevice[deviceType];

            for (const [category, score] of Object.entries(deviceScores)) {
                const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
                const emoji = getScoreEmoji(score);
                const percentage = Math.round(score * 100);
                const scoreText = `${emoji} ${percentage}%`;
                const bar = createScoreBar(score);
                const description = getScoreDescription(score);

                const rowTexts = [categoryName, scoreText, bar, description];

                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '```' + formatTableRow(rowTexts, COLUMN_WIDTHS) + '```'
                    }
                });
            }
        }
    }

    blocks.push({
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: 'Score Legend: 🟢 Good (90-100) · 🟡 Needs Improvement (50-89) · 🔴 Poor (0-49)'
            }
        ]
    });

    blocks.push({ type: 'divider' });

    for (const [url, urlResults] of Object.entries(resultsByUrl)) {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*URL:* <${url}|${url.replace(/^https?:\/\//, '')}>`
            }
        });

        for (const result of urlResults) {
            const deviceIcon = result.deviceType === 'mobile' ? '📱' : '💻';

            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Device:* ${deviceIcon} ${result.deviceType.charAt(0).toUpperCase() + result.deviceType.slice(1)}`
                }
            });

            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '```' + formatTableRow(headerTexts, COLUMN_WIDTHS) + '```'
                }
            });

            for (const category of result.categories) {
                const emoji = getScoreEmoji(category.score);
                const percentage = Math.round(category.score * 100);
                const scoreText = `${emoji} ${percentage}%`;
                const bar = createScoreBar(category.score);
                const description = getScoreDescription(category.score);

                const rowTexts = [category.title, scoreText, bar, description];

                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '```' + formatTableRow(rowTexts, COLUMN_WIDTHS) + '```'
                    }
                });
            }

            if (result.reportUrl) {
                blocks.push({
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: `📋 HTML report generated (available in GitHub Actions artifacts)`
                        }
                    ]
                });
            }
        }

        blocks.push({ type: 'divider' });
    }

    if (Object.keys(results.summary.averageScores).length > 0) {
        let bestCategory = '';
        let bestScore = 0;
        let worstCategory = '';
        let worstScore = 1;

        for (const [category, score] of Object.entries(results.summary.averageScores)) {
            if (score > bestScore) {
                bestScore = score;
                bestCategory = category;
            }
            if (score < worstScore) {
                worstScore = score;
                worstCategory = category;
            }
        }

        const mobileScores = results.summary.scoresByDevice['mobile'];
        const desktopScores = results.summary.scoresByDevice['desktop'];
        let deviceComparisonInsight = '';

        if (mobileScores && desktopScores) {
            let biggestDiffCategory = '';
            let biggestDiff = 0;

            for (const category of Object.keys(mobileScores)) {
                if (desktopScores[category]) {
                    const diff = Math.abs(mobileScores[category] - desktopScores[category]);
                    if (diff > biggestDiff) {
                        biggestDiff = diff;
                        biggestDiffCategory = category;
                    }
                }
            }

            if (biggestDiffCategory) {
                const mobileScore = mobileScores[biggestDiffCategory];
                const desktopScore = desktopScores[biggestDiffCategory];
                const betterDevice = mobileScore > desktopScore ? 'Mobile' : 'Desktop';
                const percentageDiff = Math.round(biggestDiff * 100);

                deviceComparisonInsight = `• *Biggest device difference:* ${biggestDiffCategory.charAt(0).toUpperCase() + biggestDiffCategory.slice(1)} performs ${percentageDiff}% better on ${betterDevice}`;
            }
        }

        if (bestCategory && worstCategory) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*Key Insights:*'
                }
            });

            const insights = [
                `• *Strongest Area:* ${bestCategory.charAt(0).toUpperCase() + bestCategory.slice(1)} at ${formatScore(bestScore)}`,
                `• *Area for Improvement:* ${worstCategory.charAt(0).toUpperCase() + worstCategory.slice(1)} at ${formatScore(worstScore)}`
            ];

            if (deviceComparisonInsight) {
                insights.push(deviceComparisonInsight);
            }

            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: insights.join('\n')
                }
            });
        }
    }

    blocks.push({
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: `Generated by Lighthouse CI Slack Reporter · ${new Date().toISOString()}`
            }
        ]
    });

    return blocks;
}

/**
 * Send Lighthouse results to Slack via webhook
 */
async function sendViaWebhook(
    webhookUrl: string,
    blocks: SlackBlock[],
    channel?: string,
    timeoutMs: number = 10000
): Promise<void> {
    core.debug(`Sending report to Slack webhook`);

    try {
        const webhook = new IncomingWebhook(webhookUrl);
        const message: any = { blocks };

        if (channel) {
            message.channel = channel;
        }

        const messageSize = JSON.stringify(message).length;
        core.debug(`Slack webhook message size: ${messageSize} characters`);

        if (messageSize > 3500) {
            core.warning(`Slack message is large (${messageSize} characters), might be truncated by Slack`);
        }

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Slack webhook request timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        await Promise.race([
            webhook.send(message),
            timeoutPromise
        ]);

        core.info('Successfully sent report to Slack via webhook');
    } catch (error) {
        core.error('Failed to send report to Slack via webhook');
        if (error instanceof Error) {
            core.error(error.message);
        }
        throw error;
    }
}

/**
 * Send Lighthouse results to Slack via API
 */
async function sendViaApi(
    token: string,
    blocks: SlackBlock[],
    channel?: string,
    title?: string
): Promise<void> {
    core.debug(`Sending report to Slack API`);

    try {
        const client = new WebClient(token);

        const messageSize = JSON.stringify({ blocks }).length;
        core.debug(`Slack API message size: ${messageSize} characters`);

        if (messageSize > 3500) {
            core.warning(`Slack message is large (${messageSize} characters), might be truncated by Slack`);
        }

        const result = await client.chat.postMessage({
            channel: channel || '#general',
            text: title || 'Lighthouse Test Results',
            blocks
        });

        core.debug(`Slack API response: ${JSON.stringify(result)}`);
        core.info('Successfully sent report to Slack via API');
    } catch (error) {
        core.error('Failed to send report to Slack via API');
        if (error instanceof Error) {
            core.error(error.message);
        }
        throw error;
    }
}

/**
 * Send Lighthouse results to Slack
 */
export async function sendSlackReport(
    results: FormattedLighthouseResults,
    title: string = 'Lighthouse Test Results'
): Promise<void> {
    const webhookUrl = core.getInput('slack_webhook_url');
    const slackToken = core.getInput('slack_token');
    const channel = core.getInput('slack_channel');
    const useCompactFormat = core.getInput('slack_compact_format') !== 'false'; // Default to true

    core.info('Preparing to send report to Slack');

    let blocks: SlackBlock[];
    if (useCompactFormat) {
        blocks = createCompactSlackBlocks(results, title);
        core.debug('Using compact table format for Slack message');
    } else {
        blocks = createDetailedSlackBlocks(results, title);
        core.debug('Using detailed format for Slack message');
    }

    core.debug(`Slack message size: ${JSON.stringify(blocks).length} characters`);

    if (webhookUrl) {
        await sendViaWebhook(webhookUrl, blocks, channel);
    } else if (slackToken) {
        await sendViaApi(slackToken, blocks, channel, title);
    } else {
        throw new Error('Either slack_webhook_url or slack_token must be provided');
    }
}
