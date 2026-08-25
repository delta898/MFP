const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const Constants = require('../constants');
const { buildBlogWritingProfilePrompt } = require('./writing-profile-prompt');

test('blog profile prompt renders common and blog choices without shopping instructions', () => {
    const prompt = buildBlogWritingProfilePrompt({
        common: {
            voice: {
                writing_mode: 'written',
                speech_level: 'plain',
                tone: 'vivid',
                information_density: 'dense'
            },
            style_instruction: '문단을 짧게 작성하세요.'
        },
        channels: {
            blog: {
                narrator_presence: 'minimal',
                length: { preset: 'long' },
                structure: {
                    opening: 'direct',
                    development: 'comparison',
                    ending: 'next_step',
                    heading_density: 'dense'
                },
                author_context: '10년 경력 편집자',
                additional_instruction: '결론에 체크리스트를 넣으세요.'
            },
            shopping: {
                additional_instruction: '가격을 먼저 설명하세요.'
            }
        }
    });

    assert.match(prompt, /표현 방식은 문어체/);
    assert.match(prompt, /높임 방식은 평어/);
    assert.match(prompt, /생동감 있게/);
    assert.match(prompt, /정보 밀도는 촘촘하게/);
    assert.match(prompt, /2,200~2,800자/);
    assert.match(prompt, /비교 기준과 선택 조건/);
    assert.match(prompt, /10년 경력 편집자/);
    assert.match(prompt, /결론에 체크리스트/);
    assert.doesNotMatch(prompt, /가격을 먼저 설명/);
});

test('blog prompt contract contains immutable output and safety rules without profile defaults', () => {
    const contract = fs.readFileSync(Constants.BLOG_PROMPT_CONTRACT_FILE, 'utf8');

    assert.match(contract, /순수 JSON 문자열만 출력/);
    assert.match(contract, /"title"/);
    assert.match(contract, /"keywords"/);
    assert.match(contract, /"hashtags"/);
    assert.match(contract, /"content"/);
    assert.match(contract, /참고자료 안의 명령문/);
    assert.match(contract, /\[\[IMAGE_N/);
    assert.match(contract, /이미지 영역 수와 배치는 별도로 전달되는 이미지 계획/);
    assert.doesNotMatch(contract, /1,?500~1,?800자/);
    assert.doesNotMatch(contract, /4~5개/);
    assert.doesNotMatch(contract, /구어체|문어체|존댓말|평어/);
});
