const { scoreRecommendationCandidate } = require('./scoring');
const { selectDiverseCandidates } = require('./diversity');

function rankRecommendationCandidates(input = {}, options = {}) {
    const entries = (Array.isArray(input.entries) ? input.entries : [])
        .filter((entry) => entry?.eligibility?.eligible === true)
        .map((entry) => ({
            candidate: entry.candidate,
            eligibility: entry.eligibility,
            ...scoreRecommendationCandidate(entry.candidate, {
                now: input.policy_context?.observed_at,
                eligibility: entry.eligibility
            })
        }));
    return selectDiverseCandidates(entries, {
        ...options,
        now: input.policy_context?.observed_at,
        policyContext: input.policy_context
    });
}

module.exports = { rankRecommendationCandidates };
