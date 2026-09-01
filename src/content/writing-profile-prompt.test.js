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
    assert.match(prompt, /H2 소제목은 5~6개/);
    assert.match(prompt, /도입은 H2 없이 약 150~250자/);
    assert.match(prompt, /한두 문장짜리 빈약한 섹션은 만들지 마세요/);
    assert.match(prompt, /핵심 설명과 함께 해석 또는.*실용 정보/);
    assert.match(prompt, /\[\[IMAGE_N \.\.\.\]\] 블록 전체의 title·prompt/);
    assert.match(prompt, /비교 기준과 선택 조건/);
    assert.match(prompt, /10년 경력 편집자/);
    assert.match(prompt, /결론에 체크리스트/);
    assert.doesNotMatch(prompt, /가격을 먼저 설명/);
});

test('blog length presets provide explicit reader-visible length and H2 guides', () => {
    const expected = [
        ['short', '900~1,200자', 'H2 소제목은 3개'],
        ['standard', '1,500~1,800자', 'H2 소제목은 4~5개'],
        ['long', '2,200~2,800자', 'H2 소제목은 5~6개']
    ];

    expected.forEach(([preset, length, headings]) => {
        const prompt = buildBlogWritingProfilePrompt({
            common: { voice: {} },
            channels: {
                blog: {
                    length: { preset },
                    structure: { heading_density: 'balanced' }
                }
            }
        });
        assert.match(prompt, new RegExp(length));
        assert.match(prompt, new RegExp(headings));
        assert.match(prompt, /독자가 실제로 읽는 순수 본문/);
        assert.match(prompt, /Markdown 문법 기호/);
    });
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
    assert.match(contract, /공백을 포함한 독자 가독 본문/);
    assert.match(contract, /이미지 블록 전체의 title·prompt·구분 문자는 글자 수에서 제외/);
    assert.match(contract, /이미지 영역 수와 배치는 별도로 전달되는 이미지 계획/);
    assert.doesNotMatch(contract, /1,?500~1,?800자/);
    assert.doesNotMatch(contract, /4~5개/);
    assert.doesNotMatch(contract, /구어체|문어체|존댓말|평어/);
});
