'use strict';

function createSnsAutomationApplication(deps = {}) {
    const { rssDiscovery, distributionRunner } = deps;

    async function discover(trigger = 'manual') {
        if (typeof rssDiscovery?.run !== 'function') {
            return {
                success: false,
                code: 'SNS_DISCOVERY_NOT_CONFIGURED',
                message: 'SNS RSS Discovery가 구성되지 않았습니다.'
            };
        }
        return rssDiscovery.run(trigger);
    }

    async function distribute(trigger = 'manual') {
        if (typeof distributionRunner?.run !== 'function') {
            return {
                success: false,
                code: 'SNS_DISTRIBUTION_NOT_CONFIGURED',
                message: 'SNS Distribution Runner가 구성되지 않았습니다.'
            };
        }
        return distributionRunner.run(trigger);
    }

    async function runAutomaticCycle(trigger = 'auto') {
        const discovery = await discover(trigger);
        if (!discovery?.success) {
            return {
                success: false,
                code: discovery?.code || 'SNS_DISCOVERY_FAILED',
                message: discovery?.message || 'SNS RSS 확인에 실패했습니다.',
                data: { discovery, distribution: null }
            };
        }

        const distribution = await distribute(trigger);
        return {
            success: distribution?.success === true,
            code: distribution?.success
                ? 'SNS_AUTOMATION_COMPLETED'
                : (distribution?.code || 'SNS_DISTRIBUTION_FAILED'),
            message: distribution?.message || '',
            data: { discovery, distribution }
        };
    }

    return { discover, distribute, runAutomaticCycle };
}

module.exports = { createSnsAutomationApplication };
