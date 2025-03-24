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
    text?: TextObject | MrkdwnElement;
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

interface SummaryColumnSlot {
    mobileScoreEmoji: string | null;
    desktopScoreEmoji: string | null;
}

type SlackBlock = SectionBlock | HeaderBlock | DividerBlock | ContextBlock;

interface CategoryData {
    title: string;
    icon: string;
}

/**
 * Get emoji for a Lighthouse score using Unicode emoji
 */
function getScoreEmoji(score: number): string {
    if (score >= 0.9) return '🟢';
    if (score >= 0.5) return '🟡';
    return '🔴';
}

/**
 * Format a number as percentage
 */
function formatPercentage(score: number): string {
    return `${Math.round(score * 100)}%`;
}

const categoryConfig: Record<string, CategoryData> = {
    'performance': { title: 'Performance', icon: '⚡️' },
    'accessibility': { title: 'Accessibility', icon: '♿️' },
    'best-practices': { title: 'Best Practices', icon: '🙌' },
    'bestpractices': { title: 'Best Practices', icon: '🙌' },
    'seo': { title: 'SEO', icon: '🔍' },
    'pwa': { title: 'PWA', icon: '📱' }
};

/**
 * Get configuration for a category
 */
function getCategoryConfig(categoryName: string): CategoryData {
    const normalized = getNormalizedCategoryName(categoryName);
    return categoryConfig[normalized] || {
        title: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
        icon: '📊'
    };
}

/**
 * Normalize category name for consistent handling
 */
function getNormalizedCategoryName(name: string): string {
    if (!name) return 'unknown';

    name = name.toLowerCase().trim();

    if (name === 'bestpractices' || name === 'best practices') {
        return 'best-practices';
    }

    return name;
}

/**
 * Generate table header for categories
 * Uses fixed-width columns for better alignment
 */
function generateCategoryHeaders(categories: string[], hasMobileTests = false, hasDesktopTests = false): string {
    if (categories.length === 0) return "```| No categories tested |```";

    const COLUMN_WIDTH = 13;
    const DEVICE_COLUMN_WIDTH = 5;

    let header = "```| ";

    categories.forEach(category => {
        const config = getCategoryConfig(category);
        const icon = config.icon;
        const paddingSize = Math.floor((COLUMN_WIDTH - icon.length) / 2);
        const leftPad = " ".repeat(paddingSize);
        const rightPad = " ".repeat(COLUMN_WIDTH - icon.length - paddingSize);
        header += `${leftPad}${icon}${rightPad}|`;
    });

    let deviceSummary = "";
    if (hasMobileTests) {
        deviceSummary += "📱";
    }
    if (hasDesktopTests) {
        if (deviceSummary.length) deviceSummary += " ";
        deviceSummary += "💻";
    }

    const devicePaddingSize = Math.floor((DEVICE_COLUMN_WIDTH - deviceSummary.length) / 2);
    header += ` ${" ".repeat(devicePaddingSize)}${deviceSummary}${" ".repeat(Math.max(0, DEVICE_COLUMN_WIDTH - deviceSummary.length - devicePaddingSize))}`;

    return header + "```";
}

/**
 * Create row for score data with consistent column widths
 */
function formatScoreRow(
    categories: string[],
    mobileScores: Record<string, number>,
    desktopScores: Record<string, number>,
    hasMobile: boolean,
    hasDesktop: boolean,
    urlText: string,
    summaryColumn: SummaryColumnSlot
): string {
    if (categories.length === 0) return "```| No data available |```";

    const COLUMN_WIDTH = 13;
    const DEVICE_COLUMN_WIDTH = 5;

    let row = "```|";

    categories.forEach(category => {
        const mobileScore = mobileScores[category] || 0;
        const desktopScore = desktopScores[category] || 0;

        let scoreText;

        if (hasMobile && hasDesktop) {
            const mobileFormatted = formatPercentage(mobileScore);
            const desktopFormatted = formatPercentage(desktopScore);
            scoreText = `${mobileFormatted}/${desktopFormatted}`;
        } else if (hasMobile) {
            scoreText = formatPercentage(mobileScore);
        } else if (hasDesktop) {
            scoreText = formatPercentage(desktopScore);
        } else {
            scoreText = "N/A";
        }

        const paddingSize = Math.floor((COLUMN_WIDTH - scoreText.length) / 2);
        const leftPad = " ".repeat(paddingSize);
        const rightPad = " ".repeat(COLUMN_WIDTH - scoreText.length - paddingSize);

        row += `${leftPad}${scoreText}${rightPad}|`;
    });

    let summaryText = "";
    if (summaryColumn.mobileScoreEmoji) {
        summaryText += summaryColumn.mobileScoreEmoji;
    }
    if (summaryColumn.desktopScoreEmoji) {
        if (summaryText.length) {
            summaryText += "/";
        }
        summaryText += summaryColumn.desktopScoreEmoji;
    }

    const summaryPaddingSize = Math.floor((DEVICE_COLUMN_WIDTH - summaryText.length) / 2);
    row += ` ${" ".repeat(summaryPaddingSize)}${summaryText}${" ".repeat(Math.max(0, DEVICE_COLUMN_WIDTH - summaryText.length - summaryPaddingSize))}`;

    return row + "\n" + urlText + "```";
}

/**
 * Generate legend explanation for the table
 */
function generateLegend(categories: string[], hasMobile: boolean, hasDesktop: boolean): string {
    let legend = "Legend: ";

    const categoryLegends = categories.map(cat => {
        const config = getCategoryConfig(cat);
        return `${config.icon} - ${config.title}`;
    });
    legend += categoryLegends.join(" • ");

    if (hasMobile && hasDesktop) {
        legend += "\n📊 Format: Mobile/Desktop scores";
    } else if (hasMobile) {
        legend += "\n📊 Showing Mobile scores";
    } else if (hasDesktop) {
        legend += "\n📊 Showing Desktop scores";
    }

    return legend;
}

/**
 * Create a Slack message for the Lighthouse results with a consistent tabular layout
 */
function createSlackBlocks(
    results: FormattedLighthouseResults,
    title: string
): Array<SlackBlock> {
    core.debug('Creating enhanced Slack message blocks with tabular layout');

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
        },
        {
            type: 'divider'
        }
    ];

    const urlResults: Record<string, {
        mobileScores: Record<string, number>;
        desktopScores: Record<string, number>;
    }> = {};

    const allCategories = new Set<string>();
    let hasMobileTests = false;
    let hasDesktopTests = false;

    results.results.forEach(result => {
        const url = result.url;

        if (!urlResults[url]) {
            urlResults[url] = {
                mobileScores: {},
                desktopScores: {}
            };
        }

        result.categories.forEach(category => {
            const rawCategoryName = category.id || category.title.toLowerCase();
            const categoryName = getNormalizedCategoryName(rawCategoryName);

            allCategories.add(categoryName);

            if (result.deviceType === 'mobile') {
                hasMobileTests = true;
                urlResults[url].mobileScores[categoryName] = category.score;
            } else {
                hasDesktopTests = true;
                urlResults[url].desktopScores[categoryName] = category.score;
            }
        });
    });

    const sortedCategories = Array.from(allCategories).sort((a, b) => {
        const order = ['performance', 'seo', 'accessibility', 'best-practices'];
        return order.indexOf(a) - order.indexOf(b);
    });

    const legendBlock: SectionBlock = {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: generateLegend(sortedCategories, hasMobileTests, hasDesktopTests)
        }
    };
    blocks.push(legendBlock);

    const headerBlock: SectionBlock = {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: generateCategoryHeaders(sortedCategories, hasMobileTests, hasDesktopTests)
        }
    };
    blocks.push(headerBlock);

    const SLACK_MESSAGE_CHAR_LIMIT = 3000;
    let currentMessageLength = JSON.stringify(blocks).length;

    for (const [url, data] of Object.entries(urlResults)) {
        let deviceSection = "";

        const summaryColumn: SummaryColumnSlot = { mobileScoreEmoji: null, desktopScoreEmoji: null };

        if (hasMobileTests && Object.keys(data.mobileScores).length > 0) {
            const mobileAvgScore = Object.values(data.mobileScores).reduce((sum, score) => sum + score, 0) /
                (Object.values(data.mobileScores).length || 1);
            summaryColumn.mobileScoreEmoji = getScoreEmoji(mobileAvgScore);
        }

        if (hasDesktopTests && Object.keys(data.desktopScores).length > 0) {
            const desktopAvgScore = Object.values(data.desktopScores).reduce((sum, score) => sum + score, 0) /
                (Object.values(data.desktopScores).length || 1);
            summaryColumn.desktopScoreEmoji = getScoreEmoji(desktopAvgScore);
        }

        if (hasMobileTests && hasDesktopTests) {
            deviceSection = "📱 Mobile & 💻 Desktop";
        } else if (hasMobileTests) {
            deviceSection = "📱 Mobile";
        } else if (hasDesktopTests) {
            deviceSection = "💻 Desktop";
        }

        const urlText = `${url}`;

        const scoresBlock: SectionBlock = {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: formatScoreRow(
                    sortedCategories,
                    data.mobileScores,
                    data.desktopScores,
                    hasMobileTests,
                    hasDesktopTests,
                    urlText,
                    summaryColumn
                )
            }
        };

        const blocksSize = JSON.stringify([scoresBlock]).length;
        if (currentMessageLength + blocksSize > SLACK_MESSAGE_CHAR_LIMIT) {
            const warningBlock: ContextBlock = {
                type: 'context',
                elements: [{
                    type: 'mrkdwn',
                    text: '⚠️ Some results were omitted due to Slack message size limitations'
                }]
            };
            blocks.push(warningBlock);
            break;
        }

        blocks.push(scoresBlock);
        currentMessageLength += blocksSize;
    }

    if (Object.keys(results.summary.averageScores).length > 0) {
        blocks.push({
            type: 'divider'
        });

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

            const insights = [
                `• *Strongest Area:* ${getCategoryConfig(bestCategory).title} at ${formatScore(bestScore)}`,
                `• *Area for Improvement:* ${getCategoryConfig(worstCategory).title} at ${formatScore(worstScore)}`
            ];

            if (hasMobileTests && hasDesktopTests) {
                let biggestGapCategory = '';
                let biggestGap = 0;
                let mobileScore = 0;
                let desktopScore = 0;

                for (const [category, mobileAvg] of Object.entries(results.summary.scoresByDevice['mobile'] || {})) {
                    const desktopAvg = results.summary.scoresByDevice['desktop']?.[category] || 0;
                    const gap = Math.abs(mobileAvg - desktopAvg);

                    if (gap > biggestGap) {
                        biggestGap = gap;
                        biggestGapCategory = category;
                        mobileScore = mobileAvg;
                        desktopScore = desktopAvg;
                    }
                }

                if (biggestGapCategory && biggestGap > 0.1) {
                    const betterDevice = mobileScore > desktopScore ? 'Mobile' : 'Desktop';
                    insights.push(`• *Device Gap:* ${getCategoryConfig(biggestGapCategory).title} is ${Math.round(biggestGap * 100)}% better on ${betterDevice}`);
                }
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

    const footerText = [];
    footerText.push(`Generated by Lighthouse CI Slack Reporter · ${new Date().toISOString()}`);

    if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID) {
        const repoUrl = process.env.GITHUB_REPOSITORY;
        const runId = process.env.GITHUB_RUN_ID;
        footerText.push(`<https://github.com/${repoUrl}/actions/runs/${runId}|Download full report from GitHub>`);
    }

    blocks.push({
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: footerText.join(' · ')
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
            if (error.message.includes('429')) {
                core.error('Rate limit exceeded. Try again later or reduce request frequency.');
            } else if (error.message.includes('404')) {
                core.error('Webhook URL not found. Please verify the webhook URL is correct.');
            } else if (error.message.includes('timeout')) {
                core.error('Request timed out. Check your network or Slack server status.');
            }
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
    title?: string,
    timeoutMs: number = 10000
): Promise<void> {
    core.debug(`Sending report to Slack API`);

    try {
        const client = new WebClient(token, {
            timeout: timeoutMs,
            retryConfig: {
                retries: 2,
                factor: 2,
                minTimeout: 1000
            }
        });

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
            if (error.message.includes('invalid_auth') || error.message.includes('not_authed')) {
                core.error('Invalid Slack token. Please check your token permissions and validity.');
            } else if (error.message.includes('channel_not_found')) {
                core.error(`Channel '${channel || '#general'}' not found. Please verify the channel exists and the bot has access to it.`);
            }
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
    const timeoutMs = parseInt(core.getInput('slack_timeout_ms') || '10000');

    core.info('Preparing to send report to Slack');

    const blocks = createSlackBlocks(results, title);

    if (webhookUrl) {
        await sendViaWebhook(webhookUrl, blocks, channel, timeoutMs);
    } else if (slackToken) {
        await sendViaApi(slackToken, blocks, channel, title, timeoutMs);
    } else {
        throw new Error('Either slack_webhook_url or slack_token must be provided');
    }
}
