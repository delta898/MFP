const test = require('node:test');
const assert = require('node:assert/strict');

const ShoppingManager = require('./shopping-manager');

const {
    extractProductData,
    buildAiPrompt,
    dedupeShoppingTitleSubject,
    buildEngagingShoppingTitle,
    selectPrimaryPricePair,
    mergeProductData,
    choosePreferredProductTitle
} = ShoppingManager.__test;

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

test('shopping prompt applies common writing style and strategy with explicit overrides', () => {
    const searchPrompt = buildAiPrompt(createPromptProduct(), 'naver', {
        writing_mode: 'written',
        speech_level: 'plain',
        writing_strategy: 'search'
    });
    const discoveryPrompt = buildAiPrompt(createPromptProduct(), 'wordpress', {
        writing_mode: 'conversational',
        speech_level: 'polite',
        writing_strategy: 'discovery'
    });

    assert.match(searchPrompt, /간결하고 객관적인 설명문·칼럼형 문체/);
    assert.match(searchPrompt, /문어체 평어/);
    assert.match(searchPrompt, /검색 중심 전략/);
    assert.match(discoveryPrompt, /친근하고 자연스러운 후기형 문체/);
    assert.match(discoveryPrompt, /발견 중심\(피드\) 전략/);
    assert.doesNotMatch(discoveryPrompt, /{{\s*[A-Z_]+\s*}}/);
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
