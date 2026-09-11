const test = require('node:test');
const assert = require('node:assert/strict');

const CONFIG = require('./config-loader');
const ShoppingManager = require('./shopping-manager');
const { getDefaultContentWritingProfile } = require('./content/writing-profile');

const {
    extractProductData,
    buildAiPrompt,
    buildShoppingInstructionPrompt,
    selectShoppingEditorialPlan,
    buildShoppingEditorialPlanPrompt,
    dedupeShoppingTitleSubject,
    buildEngagingShoppingTitle,
    resolveShoppingProductTitle,
    isAuthenticationLikeLanding,
    selectPrimaryPricePair,
    mergeProductData,
    choosePreferredProductTitle,
    resolveViaShoppingSearchGateway
} = ShoppingManager.__test;

test('shopping preview rejects Naver authentication pages as product landings', () => {
    const authenticationPage = {
        title: '키보드 왼쪽 대문자 고정(Caps Lock)이 켜져 있어요. 비밀번호를 확인하세요.',
        body: '네이버 로그인 아이디 비밀번호를 입력해 주세요.',
        imageUrls: [],
        commerceData: {}
    };

    assert.equal(
        isAuthenticationLikeLanding(
            authenticationPage,
            'https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fsmartstore.naver.com%2Fmain%2Fproducts%2F13170591899'
        ),
        true
    );
    assert.equal(isAuthenticationLikeLanding(authenticationPage, 'https://example.com/products/1'), true);
    assert.deepEqual(resolveShoppingProductTitle('', authenticationPage.title), {
        title: '',
        source: 'missing'
    });
    assert.equal(isAuthenticationLikeLanding({
        title: '정상 상품명',
        body: '회원은 로그인 후 추가 혜택을 받을 수 있습니다.',
        imageUrls: ['https://example.com/product.jpg'],
        commerceData: { salePrice: 32000 }
    }, 'https://smartstore.naver.com/example/products/123456'), false);
});

function createPromptProduct() {
    return {
        title: 'Bear 올스텐 미니 계란찜기',
        description: '1단 타이머를 지원하는 미니 계란찜기',
        body: '계란과 간단한 찜 요리에 사용할 수 있는 상품',
        commerceData: {
            salePrice: 32800,
            originalPrice: 54000,
            discountRate: 39,
            deliveryFee: '3,000원 (주문시 결제)'
        },
        reviewData: {
            facts: ['리뷰 19,306개'],
            reviewSamples: ['아침 식사 준비가 간편하다는 반응이 있습니다.']
        }
    };
}

function withWritingProfile(profile, callback) {
    const previous = CONFIG.CONTENT_WRITING_PROFILE;
    CONFIG.CONTENT_WRITING_PROFILE = profile;
    try {
        return callback();
    } finally {
        CONFIG.CONTENT_WRITING_PROFILE = previous;
    }
}

test('shopping fallback delegates exact product recovery to the server gateway', async () => {
    let input;
    const expected = { title: '정확한 상품', productLink: 'https://example.com/products/123456' };
    const gateway = {
        recoverProduct: async (value) => {
            input = value;
            return expected;
        }
    };

    const result = await resolveViaShoppingSearchGateway('123456', '정확한 상품', gateway);

    assert.deepEqual(input, { productId: '123456', productName: '정확한 상품' });
    assert.equal(result, expected);
});

test('shopping prompt uses numbers selectively and keeps volume requirements consistent', () => {
    const prompt = buildAiPrompt(createPromptProduct(), 'naver');

    assert.match(prompt, /모든 블록에 숫자를 넣지 말고/);
    assert.match(prompt, /1,400~2,000자/);
    assert.match(prompt, /본문 5~6개 블록/);
    assert.match(prompt, /각 본문 블록은 2~4문장/);
    assert.doesNotMatch(prompt, /모든 본문 블록에는 반드시/);
    assert.doesNotMatch(prompt, /7~8개/);
    assert.doesNotMatch(prompt, /최소 \*\*4~5문장 이상\*\*/);
});

test('shopping prompt forbids fabricated experience and unsupported urgency on every platform', () => {
    const naverPrompt = buildAiPrompt(createPromptProduct(), 'naver');
    const wordpressPrompt = buildAiPrompt(createPromptProduct(), 'wordpress');

    for (const prompt of [naverPrompt, wordpressPrompt]) {
        assert.match(prompt, /직접 구매·사용·체험했다고 말하지 마세요/);
        assert.match(prompt, /긴급성 표현을 사용하지 마세요/);
        assert.match(prompt, /독자의 불안이나 조급함을 자극해 구매를 압박하지 말고/);
        assert.doesNotMatch(prompt, /지금 이 조건은 놓치면 안 되겠다/);
        assert.doesNotMatch(prompt, /개인적인 경험이 묻어나는/);
        assert.doesNotMatch(prompt, /{{\s*[A-Z_]+\s*}}/);
    }

    assert.match(naverPrompt, /모바일에서 읽기 쉬운 문단과 소제목/);
    assert.match(wordpressPrompt, /워드프레스에서 읽기 쉬운 흐름/);
});

test('shopping prompt prioritizes explicit user instructions without inventing extra experience', () => {
    const instruction = '직접 일주일 동안 사용한 후기처럼 1인칭으로 쓰고, 세척이 편했던 점을 강조해 주세요.';
    const prompt = buildAiPrompt(createPromptProduct(), 'naver', {
        instruction
    });

    assert.match(prompt, /\[사용자 참고\/지시사항 - 우선 반영\]/);
    assert.match(prompt, new RegExp(instruction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(prompt, /1인칭 후기 표현을 충실히 반영할 수 있습니다/);
    assert.match(prompt, /사용자가 제공하거나 요청하지 않은 구체적인 사용 기간, 가족, 직업, 효과, 비교 경험은 추가로 만들지 마세요/);
    assert.doesNotMatch(prompt, /{{\s*[A-Z_]+\s*}}/);
});

test('shopping instruction prompt keeps the no-fabrication default when instruction is empty', () => {
    const rules = buildShoppingInstructionPrompt('');

    assert.match(rules, /사용자 참고\/지시사항/);
    assert.match(rules, /없음/);
    assert.match(rules, /사용자가 제공하지 않은 구매·사용·체험 경험/);
});

test('shopping editorial plan is deterministic and uses only eligible evidence frames', () => {
    const product = createPromptProduct();
    const first = selectShoppingEditorialPlan(product);
    const second = selectShoppingEditorialPlan(product);

    assert.equal(first, second);
    assert.ok([
        'conditions_first',
        'reaction_first',
        'situation_first',
        'decision_checklist',
        'balanced_guide'
    ].includes(first));
});

test('shopping editorial plans vary across products without random output', () => {
    const selected = new Set();
    for (const title of ['미니 가습기', '무선 청소기', '여행용 캐리어', '원목 식탁', '러닝화', '캠핑 의자']) {
        selected.add(selectShoppingEditorialPlan({
            ...createPromptProduct(),
            title
        }));
    }

    assert.ok(selected.size > 1);
});

test('shopping editorial prompt yields to explicit user instructions', () => {
    const prompt = buildShoppingEditorialPlanPrompt(createPromptProduct(), {
        instruction: '아이와 함께 쓴 경험을 중심으로 작성'
    });

    assert.match(prompt, /이번 글의 편집 구성/);
    assert.match(prompt, /사용자 참고\/지시사항과 충돌하는 부분은 버리고/);
    assert.match(prompt, /전체 5~6개 블록 계약은 유지하세요/);
});

test('shopping editorial prompt applies an explicit content focus', () => {
    const comparison = buildShoppingEditorialPlanPrompt(createPromptProduct(), { contentFocus: 'comparison' });
    const usage = buildShoppingEditorialPlanPrompt(createPromptProduct(), { contentFocus: 'usage' });

    assert.match(comparison, /글의 초점: 비교·선택 가이드/);
    assert.match(comparison, /선택 구성: 비교 체크리스트 구성/);
    assert.match(usage, /글의 초점: 사용 상황 제안/);
    assert.match(usage, /선택 구성: 사용 상황에서 시작하는 구성|선택 구성: 사용 상황에서 출발하는 구성/);
});

test('shopping prompt applies selected common profile voice and per-post strategy', () => {
    const writtenProfile = getDefaultContentWritingProfile();
    writtenProfile.common.voice.writing_mode = 'written';
    writtenProfile.common.voice.speech_level = 'plain';
    const searchPrompt = withWritingProfile(writtenProfile, () => buildAiPrompt(createPromptProduct(), 'naver', {
        writing_strategy: 'search'
    }));

    const conversationalProfile = getDefaultContentWritingProfile();
    const discoveryPrompt = withWritingProfile(conversationalProfile, () => buildAiPrompt(createPromptProduct(), 'wordpress', {
        writing_strategy: 'discovery'
    }));

    assert.match(searchPrompt, /간결하고 객관적인 설명문·칼럼형 문체/);
    assert.match(searchPrompt, /표현 방식은 문어체/);
    assert.match(searchPrompt, /높임 방식은 평어/);
    assert.match(searchPrompt, /검색 중심 전략/);
    assert.match(discoveryPrompt, /친근하고 자연스러운 후기형 문체/);
    assert.match(discoveryPrompt, /발견 중심\(피드\) 전략/);
    assert.doesNotMatch(discoveryPrompt, /{{\s*[A-Z_]+\s*}}/);
});

test('shopping global instruction precedes product instruction and blog-only profile fields stay excluded', () => {
    const profile = getDefaultContentWritingProfile();
    profile.common.style_instruction = '전문용어를 쉬운 말로 풀어주세요.';
    profile.channels.shopping.additional_instruction = '가격보다 배송과 설치 조건을 먼저 설명하세요.';
    profile.channels.blog.additional_instruction = '블로그 결론에 체크리스트를 추가하세요.';
    profile.channels.blog.author_context = '여행 블로거';
    profile.channels.blog.style_references.sample_text.value = '블로그 문체 참고 원문';
    const productInstruction = '이 상품은 디자인 선택 기준부터 설명하세요.';

    const prompt = withWritingProfile(profile, () => buildAiPrompt(createPromptProduct(), 'naver', {
        instruction: productInstruction
    }));

    assert.match(prompt, /선택된 쇼핑 글쓰기 프로필/);
    assert.match(prompt, /전문용어를 쉬운 말로/);
    assert.match(prompt, /가격보다 배송과 설치 조건을 먼저/);
    assert.match(prompt, new RegExp(productInstruction));
    assert.ok(prompt.indexOf('가격보다 배송과 설치 조건을 먼저') < prompt.indexOf(productInstruction));
    assert.match(prompt, /이 상품 글에 한해 사용자 지시를 우선/);
    assert.doesNotMatch(prompt, /블로그 결론에 체크리스트/);
    assert.doesNotMatch(prompt, /여행 블로거/);
    assert.doesNotMatch(prompt, /블로그 문체 참고 원문/);
});

test('shopping prompt and title normalization prevent repeated product identity keywords', () => {
    const prompt = buildAiPrompt({
        ...createPromptProduct(),
        title: '삼성 갤럭시 S26 자급제 삼성 공식 갤럭시 S26 256GB 자급제'
    }, 'naver');
    const rawTitle = '삼성 갤럭시 S26 자급제 삼성 공식 갤럭시 S26 256GB 자급제, 혜택과 조건 한눈에';

    assert.match(prompt, /같은 브랜드, 모델, 규격 키워드를 각각 한 번만 사용하세요/);
    assert.equal(
        dedupeShoppingTitleSubject(rawTitle),
        '삼성 갤럭시 S26 256GB 자급제, 혜택과 조건 한눈에'
    );
    assert.equal(
        buildEngagingShoppingTitle(rawTitle, '삼성 갤럭시 S26 256GB 자급제'),
        '삼성 갤럭시 S26 256GB 자급제, 혜택과 조건 한눈에'
    );
});

test('extractProductData prefers real product title and hero prices over storefront metadata', () => {
    const html = `
        <html>
            <head>
                <title>스핀몰 : 네이버 스마트스토어</title>
                <meta property="og:title" content="스핀몰 : 네이버 스마트스토어" />
                <script type="application/ld+json">
                    {
                        "@context": "https://schema.org",
                        "@type": "Product",
                        "name": "스핀몰 : 네이버 스마트스토어",
                        "offers": {
                            "price": "1000",
                            "highPrice": "62200",
                            "discountRate": "6"
                        }
                    }
                </script>
                <script type="application/ld+json">
                    {
                        "@context": "https://schema.org",
                        "@type": "Product",
                        "name": "Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵",
                        "offers": {
                            "price": "32800",
                            "highPrice": "54000",
                            "discountRate": "39"
                        },
                        "image": ["https://shop-phinf.pstatic.net/example.jpg"]
                    }
                </script>
            </head>
            <body>
                <section class="ProductSummary">
                    <h1>Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵</h1>
                    <div class="PriceArea">39% 54,000원 32,800원 3,000원</div>
                    <dl>
                        <dt>배송비</dt>
                        <dd>3,000원 (주문시 결제)</dd>
                    </dl>
                    <div>네이버페이 머니 결제 시 최대 656원 적립</div>
                    <div>이벤트 리뷰 작성 시, N포인트 + 10,000원 상당 혜택 제공 중!</div>
                </section>
            </body>
        </html>
    `;

    const productData = extractProductData('https://smartstore.naver.com/spin-mall/products/8419439796', html);

    assert.equal(productData.title, 'Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵');
    assert.equal(productData.commerceData.salePrice, 32800);
    assert.equal(productData.commerceData.originalPrice, 54000);
    assert.equal(productData.commerceData.discountRate, 39);
    assert.equal(productData.commerceData.freeShipping, false);
    assert.match(productData.commerceData.deliveryFee, /3,000원/);
    assert.equal(productData.debugTrace.title.finalTitleSource, 'structured_product');
    assert.equal(productData.debugTrace.commerce.structuredOffer.price, 32800);
    assert.equal(productData.debugTrace.commerce.finalSelection.salePriceSource, 'hero_price_pair');
    assert.equal(productData.debugTrace.commerce.finalSelection.originalPriceSource, 'hero_price_pair');
    assert.equal(productData.debugTrace.commerce.discountCandidates.heroSelected.value, 39);
});

test('extractProductData strips store suffix and prefers official price over personalized discount price', () => {
    const html = `
        <html>
            <head>
                <script type="application/ld+json">
                    {
                        "@context": "https://schema.org",
                        "@type": "Product",
                        "name": "Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵 : 스핀몰",
                        "offers": {
                            "price": "32800"
                        }
                    }
                </script>
            </head>
            <body>
                <section class="ProductSummary">
                    <div>Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵 무료교환반품 네이버 오늘배송</div>
                    <div>44% 할인 할인 전 가격 54,000원 상품 가격 32,800원 3,000원</div>
                    <div>나의 할인가 29,800원 -3,000원 첫구매 대상 3,000원 상품중복할인</div>
                    <div>최대 596원 추가 적립(2%)</div>
                    <div>배송비 3,000원 (주문시 결제)</div>
                </section>
            </body>
        </html>
    `;

    const productData = extractProductData('https://smartstore.naver.com/spin-mall/products/8419439796', html);

    assert.equal(productData.title, 'Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵');
    assert.equal(productData.commerceData.salePrice, 32800);
    assert.equal(productData.commerceData.originalPrice, 54000);
    assert.ok([39, 44].includes(productData.commerceData.discountRate));
});

test('extractProductData sanitizes noisy delivery fee text down to official fee', () => {
    const html = `
        <html>
            <body>
                <section class="ProductSummary">
                    <h1>Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵</h1>
                    <div>44% 할인 할인 전 가격 54,000원 상품 가격 32,800원</div>
                    <dl>
                        <dt>배송비</dt>
                        <dd>3,000원 (주문시 결제) 네이버플러스 멤버십 N배송 무료배송 적용 도움말 (선물하기, 정기구독, 착불 등 일부 제외)</dd>
                    </dl>
                </section>
            </body>
        </html>
    `;

    const productData = extractProductData('https://smartstore.naver.com/spin-mall/products/8419439796', html);

    assert.equal(productData.commerceData.deliveryFee, '3,000원 (주문시 결제)');
    assert.equal(productData.commerceData.freeShipping, false);
});

test('selectPrimaryPricePair ignores benefit and shipping amounts when a valid discount pair exists', () => {
    const pair = selectPrimaryPricePair([
        { value: 1000, context: '이벤트 리뷰 작성 시 1,000원 쿠폰', index: 10 },
        { value: 54000, context: '39% 54,000원 32,800원', index: 20 },
        { value: 32800, context: '39% 54,000원 32,800원', index: 30 },
        { value: 3000, context: '배송비 3,000원', index: 40 }
    ], 39);

    assert.equal(pair.salePrice, 32800);
    assert.equal(pair.originalPrice, 54000);
    assert.equal(pair.discountRate, 39);
});

test('extractProductData debug trace records discount candidates and rejection reasons', () => {
    const html = `
        <html>
            <head>
                <title>스핀몰 : 네이버 스마트스토어</title>
                <script type="application/ld+json">
                    {
                        "@context": "https://schema.org",
                        "@type": "Product",
                        "name": "Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵",
                        "offers": {
                            "price": "1000",
                            "highPrice": "44800",
                            "discountRate": "5"
                        }
                    }
                </script>
            </head>
            <body>
                <section class="ProductSummary">
                    <h1>Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵</h1>
                    <div class="PriceArea">39% 54,000원 32,800원</div>
                    <div>최대 5% 적립 시작하기</div>
                    <dl>
                        <dt>배송비</dt>
                        <dd>3,000원 (주문시 결제)</dd>
                    </dl>
                </section>
            </body>
        </html>
    `;

    const productData = extractProductData('https://smartstore.naver.com/spin-mall/products/8419439796', html);
    const discountCandidates = productData.debugTrace.commerce.discountCandidates.pageCandidates;
    const rejectedBenefitCandidate = discountCandidates.find(candidate => candidate.value === 5);
    const acceptedDiscountCandidate = discountCandidates.find(candidate => candidate.value === 39);

    assert.equal(productData.commerceData.discountRate, null);
    assert.equal(productData.debugTrace.commerce.finalSelection.salePriceSource, 'structured_offer');
    assert.equal(productData.debugTrace.commerce.finalSelection.originalPriceSource, 'structured_offer');
    assert.equal(productData.debugTrace.commerce.finalSelection.discountRateSource, 'dropped_due_to_inconsistent_prices');
    assert.equal(rejectedBenefitCandidate.reason, 'rejected_benefit_context');
    assert.equal(rejectedBenefitCandidate.accepted, false);
    assert.equal(acceptedDiscountCandidate.accepted, true);
});

test('extractProductData prefers visible official product section over script noise when structured data is missing', () => {
    const html = `
        <html>
            <head>
                <title>스핀몰 : 네이버 스마트스토어</title>
                <meta property="og:title" content="스핀몰 : 네이버 스마트스토어" />
            </head>
            <body>
                <script>
                    window.__NOISE__ = {"benefitPolicyName":"스핀몰 알림 1,000원_260630","bannerText":"최대 5% 적립"};
                </script>
                <section class="hero">
                    <div class="product-name">Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵</div>
                    <div class="price-box">
                        <span>39%</span>
                        <span>54,000원</span>
                        <span>32,800원</span>
                    </div>
                    <div class="delivery-box">
                        <span>배송비</span>
                        <span>3,000원 (주문시 결제)</span>
                    </div>
                </section>
            </body>
        </html>
    `;

    const productData = extractProductData('https://smartstore.naver.com/spin-mall/products/8419439796', html);

    assert.match(productData.title, /Bear|계란찜기|에그 쿠커/);
    assert.equal(productData.commerceData.salePrice, 32800);
    assert.equal(productData.commerceData.originalPrice, 54000);
    assert.equal(productData.commerceData.discountRate, 39);
    assert.equal(productData.debugTrace.title.finalTitleSource, 'visible_title');
    assert.equal(JSON.stringify(productData.debugTrace.commerce.priceCandidates.pageMentions).includes('benefitPolicyName'), false);
});

test('buildEngagingShoppingTitle falls back when AI title is storefront clickbait', () => {
    const title = buildEngagingShoppingTitle(
        '스핀몰 19,305명이 선택한 압도적 가성비, 지금',
        'Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵'
    );

    assert.notEqual(title, '스핀몰 19,305명이 선택한 압도적 가성비, 지금');
    assert.match(title, /Bear|계란찜기|에그 쿠커/);
});

test('buildEngagingShoppingTitle keeps natural titles up to 50 characters', () => {
    const title = buildEngagingShoppingTitle(
        'Bear 올스텐 미니 계란찜기, 19,306개 리뷰가 쌓인 이유를 살펴볼까요?',
        'Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵',
        {
            salePrice: 32800,
            originalPrice: 54000,
            discountRate: 39
        }
    );

    assert.equal(title, 'Bear 올스텐 미니 계란찜기, 19,306개 리뷰가 쌓인 이유를 살펴볼까요?');
    assert.equal(title.length, 43);
});

test('buildEngagingShoppingTitle preserves ai-crafted title when it is descriptive and title-like', () => {
    const title = buildEngagingShoppingTitle(
        'Bear 올스텐 미니 계란찜기, 1만 9천 개 리뷰가 증명한 아침의 혁신',
        'Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵',
        {
            salePrice: 32800,
            originalPrice: 54000,
            discountRate: 39
        }
    );

    assert.equal(title, 'Bear 올스텐 미니 계란찜기, 1만 9천 개 리뷰가 증명한 아침의 혁신');
});

test('user-entered product name overrides a generic or extracted page title', () => {
    const resolved = resolveShoppingProductTitle(
        '애플 아이폰 17 프로 맥스 자급제 2TB, 실버',
        '네이버 브랜드 커넥트'
    );

    assert.equal(resolved.source, 'user_input');
    assert.equal(resolved.title, '애플 아이폰 17 프로 맥스 자급제 2TB, 실버');
});

test('extracted product title is used when optional user product name is empty', () => {
    const resolved = resolveShoppingProductTitle('', 'Bear 올스텐 미니 계란찜기 1단 타이머');

    assert.equal(resolved.source, 'extracted');
    assert.equal(resolved.title, 'Bear 올스텐 미니 계란찜기 1단 타이머');
});

test('generic page title cannot become the product identity', () => {
    const resolved = resolveShoppingProductTitle('', '네이버 브랜드 커넥트');

    assert.equal(resolved.source, 'missing');
    assert.equal(resolved.title, '');
});

test('shopping title falls back when AI omits the product identity', () => {
    const title = buildEngagingShoppingTitle(
        '감성적인 비주얼과 디자인의 매력',
        '애플 아이폰 17 프로 맥스 자급제 2TB, 실버'
    );

    assert.match(title, /애플 아이폰 17 프로/);
    assert.doesNotMatch(title, /네이버 브랜드 커넥트/);
});

test('choosePreferredProductTitle preserves official product title over ui noise title', () => {
    const selected = choosePreferredProductTitle(
        'Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵',
        '안녕하세요. 스핀몰입니다. 관심고객수 15,027 도움말 검색어를 입력해주세요'
    );

    assert.equal(selected.title, 'Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵');
    assert.equal(selected.source, 'base');
    assert.ok(selected.baseScore > selected.extraScore);
});

test('mergeProductData does not let review-stage ui noise overwrite official title', () => {
    const baseData = {
        title: 'Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵',
        description: '',
        body: 'base body',
        imageUrls: [],
        imageMeta: [],
        structuredProduct: null,
        commerceData: {
            salePrice: 32800,
            originalPrice: 54000,
            discountRate: 39,
            freeShipping: false,
            deliveryFee: '3,000원 (주문시 결제)',
            deliveryDateNotice: '',
            deliveryMethods: [],
            installment: '',
            wishlistCount: null,
            benefitHighlights: []
        },
        reviewData: {
            reviewCount: 120,
            averageRating: null,
            recentRating: null,
            sellerName: null,
            aiSummaryPoints: [],
            reviewSamples: [],
            reviewHighlights: [],
            facts: []
        },
        debugTrace: {
            title: { finalTitle: 'Bear 올스텐 미니 계란찜기 에그 쿠커 달걀삶는 기계 1단 타이머 고구마 호빵' }
        }
    };

    const reviewCandidate = {
        title: '안녕하세요. 스핀몰입니다. 관심고객수 15,027 도움말 검색어를 입력해주세요',
        description: '',
        body: 'review body',
        imageUrls: [],
        imageMeta: [],
        structuredProduct: null,
        commerceData: {},
        reviewData: {
            reviewCount: 19306,
            averageRating: null,
            recentRating: null,
            sellerName: null,
            aiSummaryPoints: [],
            reviewSamples: ['만족해요'],
            reviewHighlights: [],
            facts: ['누적 리뷰 19,306개']
        },
        debugTrace: {
            title: { finalTitle: '안녕하세요. 스핀몰입니다. 관심고객수 15,027 도움말 검색어를 입력해주세요' }
        }
    };

    const merged = mergeProductData(baseData, reviewCandidate);

    assert.equal(merged.title, baseData.title);
    assert.equal(merged.reviewData.reviewCount, 19306);
    assert.equal(merged.debugTrace.mergeDecisions.title.source, 'base');
});
