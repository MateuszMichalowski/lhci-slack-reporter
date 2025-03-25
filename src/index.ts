import * as glob from 'glob';
import * as core from '@actions/core';
import { runLighthouseTests } from './lighthouse';
import { sendSlackReport } from './slack';
import { parseInputArray, formatLighthouseResults, validateInputs } from './utils';
import * as fs from 'fs';
import * as path from 'path';
import { DefaultArtifactClient } from "@actions/artifact";

async function run(): Promise<void> {
    try {
        core.info('🚀 Starting Lighthouse CI Slack Reporter action');

        try {
            validateInputs();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            core.setFailed(`❌ Input validation failed: ${errorMessage}`);
            return;
        }

        const urls = parseInputArray(core.getInput('urls', { required: true }));
        const deviceTypes = parseInputArray(core.getInput('device_types') || 'mobile,desktop');
        const categories = parseInputArray(core.getInput('categories') || 'performance,accessibility,best-practices,seo');
        const slackTitle = core.getInput('slack_title') || 'Lighthouse Test Results';
        const failOnScoreBelowInput = core.getInput('fail_on_score_below') || '0';
        const failOnScoreBelow = parseInt(failOnScoreBelowInput) / 100;
        const chromeFlags = core.getInput('chrome_flags') || '--no-sandbox --headless --disable-gpu';
        const timeoutInput = core.getInput('timeout') || '60';
        const timeout = parseInt(timeoutInput);

        core.info(`📋 Configuration:`);
        core.info(`  - URLs: ${urls.join(', ')}`);
        core.info(`  - Device types: ${deviceTypes.join(', ')}`);
        core.info(`  - Test categories: ${categories.join(', ')}`);
        core.info(`  - Fail on score below: ${failOnScoreBelow * 100}%`);

        core.info('🔍 Running Lighthouse tests...');
        let lighthouseResults;

        try {
            if (fs.existsSync('lighthouse-results/example.json')) {
                core.info('📋 Found mock lighthouse results, using those for local testing');
                const mockResult = JSON.parse(fs.readFileSync('lighthouse-results/example.json', 'utf8'));
                const categories = Object.entries(mockResult.categories).map(
                    ([id, category]: [string, any]) => ({
                        id,
                        title: category.title,
                        score: category.score
                    })
                );

                lighthouseResults = [
                    {
                        url: mockResult.url,
                        deviceType: 'mobile',
                        categories,
                        reportUrl: 'lighthouse-results/example.html'
                    }
                ];
            } else {
                lighthouseResults = await runLighthouseTests(
                    urls,
                    deviceTypes,
                    categories,
                    chromeFlags,
                    timeout
                );
            }

            if (!lighthouseResults || lighthouseResults.length === 0) {
                throw new Error('No Lighthouse results were generated');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            core.setFailed(`❌ Error running lighthouse tests: ${errorMessage}`);
            return;
        }

        core.info(`✅ Lighthouse tests completed: ${lighthouseResults.length} results`);

        core.info('📊 Formatting results for Slack...');
        let formattedResults;
        try {
            formattedResults = formatLighthouseResults(lighthouseResults);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            core.setFailed(`❌ Error formatting results: ${errorMessage}`);
            return;
        }

        core.info('📤 Sending results to Slack...');
        try {
            await sendSlackReport(formattedResults, slackTitle);
            core.info('✅ Results sent to Slack successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            core.warning(`⚠️ Failed to send results to Slack: ${errorMessage}`);
        }

        try {
            if (process.env.GITHUB_ACTIONS === 'true') {
                core.info('📤 Uploading Lighthouse reports as artifacts...');

                const artifactClient = new DefaultArtifactClient()
                const artifactName = 'lighthouse-reports';
                const reportDir = path.resolve(process.cwd(), 'lighthouse-results');

                if (fs.existsSync(reportDir)) {
                    const files = glob.sync(`${reportDir}/**/*.{html,json}`);

                    if (files.length > 0) {
                        const rootDirectory = process.cwd();
                        await artifactClient.uploadArtifact(
                            artifactName,
                            files,
                            rootDirectory,
                            { retentionDays: 10 }
                        );
                        core.info(`✅ Uploaded ${files.length} Lighthouse reports as artifacts`);
                    } else {
                        core.warning('No report files found to upload as artifacts');
                    }
                } else {
                    core.warning(`Report directory does not exist: ${reportDir}`);
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            core.warning(`⚠️ Failed to upload artifacts: ${errorMessage}`);
        }

        const allScores = lighthouseResults.flatMap(result =>
            result.categories.map(category => category.score)
        );

        const lowestScore = Math.min(...allScores);
        core.info(`📉 Lowest score: ${Math.round(lowestScore * 100)}%`);

        if (lowestScore < failOnScoreBelow) {
            core.setFailed(`❌ One or more scores (${Math.round(lowestScore * 100)}%) are below the threshold of ${Math.round(failOnScoreBelow * 100)}%`);
        } else {
            core.info(`✅ All scores are above the threshold of ${Math.round(failOnScoreBelow * 100)}%`);
        }

        core.info('🎉 Lighthouse CI Slack Reporter action completed successfully');
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(`❌ ${error.message}`);
        } else {
            core.setFailed(`❌ Unknown error: ${error}`);
        }
    }
}

run();
