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

type SlackBlock = SectionBlock | HeaderBlock | DividerBlock | ContextBlock;

interface CategoryData {
    title: string;
    icon: string;
}

function getScoreEmoji(score: number): string {
    if (score >= 0.9) return '🟢';
    if (score >= 0.5) return '🟡';
    return '🔴';
}

function formatPercentage(score: number): string {
    return `${Math.round(score * 100)}%`;
}

const categoryConfig: Record<string, CategoryData> = {
    'performance': { title: 'Performance', icon: '⚡️' },
    'accessibility': { title: 'Accessibility', icon: '♿️' },
    'best-practices': { title: 'Best Practices', icon: '🙌' },
    'bestpractices': { title: 'Best Practices', icon: '🙌' },
    'seo': { title: 'SEO', icon: '🔍' }
};

function getCategoryConfig(categoryName: string): CategoryData {
    const normalized = getNormalizedCategoryName(categoryName);
    return categoryConfig[normalized] || {
        title: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
        icon: '📊'
    };
}

function getNormalizedCategoryName(name: string): string {
    if (!name) return 'unknown';

    name = name.toLowerCase().trim();

    if (name === 'bestpractices' || name === 'best practices') {
        return 'best-practices';
    }

    return name;
}

function generateCategoryHeaders(categories: string[]): string {
    if (categories.length === 0) return "```| No categories tested |```";

    let header = "```|";
    categories.forEach(category => {
        const icon = getCategoryConfig(category).icon;
        header += `       ${icon}        |`;
    });
    return header + "```";
}

function formatScoreRow(
    categories: string[],
    mobileScores: Record<string, number>,
    desktopScores: Record<string, number>,
    hasMobile: boolean,
    hasDesktop: boolean,
    urlText: string
): string {
    if (categories.length === 0) return "```| No data available |```";

    let row = "```" + urlText + "\n|";

    categories.forEach(category => {
        const mobileScore = mobileScores[category] || 0;
        const desktopScore = desktopScores[category] || 0;
        
        const mobileFormatted = formatPercentage(mobileScore)
        const desktopFormatted = formatPercentage(desktopScore)
        let scoreText;
        if (hasMobile && hasDesktop) {
            scoreText = `${mobileFormatted.padStart(6)} / ${desktopFormatted.padEnd(8)}`;
        } else if (hasMobile) {
            scoreText = `${mobileFormatted.padStart(9).padEnd(17)}`;
        } else if (hasDesktop) {
            scoreText = `${desktopFormatted.padStart(9).padEnd(17)}`;
        } else {
            scoreText = "       N/A        ";
        }

        row += scoreText + "|";
    });

    return row + "```";
}

function generateLegend(categories: string[], hasMobile: boolean, hasDesktop: boolean): string {
    let legend = "Legend: ";

    const categoryLegends = categories.map(cat => {
        const config = getCategoryConfig(cat);
        return `${config.icon} - ${config.title.toLowerCase()}`;
    });
    legend += categoryLegends.join(", ");

    if (hasMobile && hasDesktop) {
        legend += " • Format: Mobile/Desktop scores";
    } else if (hasMobile) {
        legend += " • Showing Mobile scores";
    } else if (hasDesktop) {
        legend += " • Showing Desktop scores";
    }

    return legend;
}

/**
 * Create a Slack message for the Lighthouse results with a horizontal, 4-column layout
 */
function createSlackBlocks(
    results: FormattedLighthouseResults,
    title: string
): Array<SlackBlock> {
    core.debug('Creating dynamic Slack message blocks');

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
            const rawCategoryName = category.title.toLowerCase();
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
            text: generateCategoryHeaders(sortedCategories)
        }
    };
    blocks.push(headerBlock);

    const SLACK_MESSAGE_CHAR_LIMIT = 3000;
    let currentMessageLength = JSON.stringify(blocks).length;

    for (const [url, data] of Object.entries(urlResults)) {
        let deviceSection = "";

        if (hasMobileTests && Object.keys(data.mobileScores).length > 0) {
            const mobileAvgScore = Object.values(data.mobileScores).reduce((sum, score) => sum + score, 0) /
                (Object.values(data.mobileScores).length || 1);
            const mobileEmoji = getScoreEmoji(mobileAvgScore);
            deviceSection += `📱 ${mobileEmoji}`;
        }

        if (hasDesktopTests && Object.keys(data.desktopScores).length > 0) {
            if (deviceSection.length > 0) {
                deviceSection += "   •   ";
            }
            const desktopAvgScore = Object.values(data.desktopScores).reduce((sum, score) => sum + score, 0) /
                (Object.values(data.desktopScores).length || 1);
            const desktopEmoji = getScoreEmoji(desktopAvgScore);
            deviceSection += `💻 ${desktopEmoji}`;
        }

        const urlText = deviceSection.length > 0 ? `${url} - ${deviceSection}` : url;

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
                    urlText
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
        const dividerBlock: DividerBlock = {
            type: 'divider'
        };
        blocks.push(dividerBlock);

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
            const insightHeaderBlock: SectionBlock = {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*Key Insights:*'
                }
            };
            blocks.push(insightHeaderBlock);

            const insights = [
                `• *Strongest Area:* ${bestCategory.charAt(0).toUpperCase() + bestCategory.slice(1)} at ${formatScore(bestScore)}`,
                `• *Area for Improvement:* ${worstCategory.charAt(0).toUpperCase() + worstCategory.slice(1)} at ${formatScore(worstScore)}`
            ];

            const insightsBlock: SectionBlock = {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: insights.join('\n')
                }
            };
            blocks.push(insightsBlock);
        }
    }

    const footerText = [];
    footerText.push(`Generated by Lighthouse CI Slack Reporter · ${new Date().toISOString()}`);

    if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID) {
        const repoUrl = process.env.GITHUB_REPOSITORY;
        const runId = process.env.GITHUB_RUN_ID;
        footerText.push(`<https://github.com/${repoUrl}/actions/runs/${runId}|Download full report from GitHub>`);
    }

    const footerBlock: ContextBlock = {
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: footerText.join(' · ')
            }
        ]
    };
    blocks.push(footerBlock);

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

    core.info('Preparing to send report to Slack');

    const blocks = createSlackBlocks(results, title);

    if (webhookUrl) {
        await sendViaWebhook(webhookUrl, blocks, channel);
    } else if (slackToken) {
        await sendViaApi(slackToken, blocks, channel, title);
    } else {
        throw new Error('Either slack_webhook_url or slack_token must be provided');
    }
}
