'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getActionInputPolicy, formatInputPolicy } = require('./input-policy');

test('shared input policy normalizes required questions and optional field guidance', () => {
    const policy = getActionInputPolicy({
        agentExposure: {
            inputPolicy: {
                subject: { kind: 'required', question: '주제를 알려주세요.' },
                category: { kind: 'optional', prompt: '카테고리를 고를 수 있습니다.', label: '카테고리', choices: ['A', 'B'] }
            }
        }
    });

    assert.deepEqual(policy.required, { subject: '주제를 알려주세요.' });
    assert.deepEqual(policy.optional, { category: '카테고리를 고를 수 있습니다.' });
    assert.deepEqual(policy.optionalDefinitions.category, {
        kind: 'optional', prompt: '카테고리를 고를 수 있습니다.', label: '카테고리', choices: ['A', 'B']
    });
    assert.match(formatInputPolicy(policy), /필수 정보 질문/);
    assert.match(formatInputPolicy(policy), /사용자가 선택 항목을 지정했지만 값이 불명확하면 먼저 물어보고/);
});

test('shared input policy retains descriptors that have not yet migrated', () => {
    const policy = getActionInputPolicy({
        agentExposure: {
            requiredInputQuestions: { target: '대상을 선택해 주세요.' },
            optionalInputSuggestions: { keywords: '키워드를 알려주세요.' }
        }
    });

    assert.deepEqual(policy.required, { target: '대상을 선택해 주세요.' });
    assert.equal(policy.optionalDefinitions.keywords.label, 'keywords');
});
