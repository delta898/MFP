/**
 * Google Sheets Apps Script for NaverAutoBlog Automation
 * =====================================================
 * 
 * 기능:
 * 1. [trends 시트] '동작/상태'를 '키워드 목록에 추가'로 변경 → keywords 시트에 키워드 복사
 * 2. [keywords 시트] '동작 / 상태'를 '연관검색어 조사'로 변경 → 네이버 API로 연관검색어 + 블로그 URL 수집 → topics 시트에 추가
 * 
 * 설치 방법:
 * 1. 구글 스프레드시트에서 [확장 프로그램] > [Apps Script] 클릭
 * 2. 이 코드를 복사해서 붙여넣기
 * 3. [저장] 아이콘 클릭
 * 4. 왼쪽 메뉴 ⚙️ [프로젝트 설정] > [스크립트 속성] 에서 아래 2개 추가:
 *    - NAVER_CLIENT_ID : 네이버 개발자센터 Client ID
 *    - NAVER_CLIENT_SECRET : 네이버 개발자센터 Client Secret
 * 5. 상단 함수 드롭다운에서 'setupTrigger' 선택 후 ▶ 실행 (최초 1회)
 *    - 권한 승인 팝업이 뜨면 '허용'
 * 6. 시트로 돌아가서 테스트!
 */

// ============================================================
// 🔧 설치형 트리거 등록 (최초 1회 실행)
// ============================================================
function setupTrigger() {
    // 기존 onSheetEdit 트리거가 있으면 제거 (중복 방지)
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === 'onSheetEdit') {
            ScriptApp.deleteTrigger(triggers[i]);
        }
    }

    // 새 설치형 onEdit 트리거 등록
    ScriptApp.newTrigger('onSheetEdit')
        .forSpreadsheet(SpreadsheetApp.getActive())
        .onEdit()
        .create();

    SpreadsheetApp.getActive().toast('✅ 트리거 설치 완료! 이제 시트에서 드롭다운을 변경하면 자동으로 동작합니다.');
}

// ============================================================
// 📌 메인: 시트 편집 이벤트 핸들러 (설치형 트리거)
// ============================================================
function onSheetEdit(e) {
    if (!e) return;

    var sheet = e.source.getActiveSheet();
    var sheetName = sheet.getName();
    var range = e.range;
    var col = range.getColumn();
    var newValue = e.value;

    // 값이 없으면 (셀 삭제 등) 무시
    if (!newValue) return;

    try {
        // ── trends 시트: '키워드 목록에 추가' ──
        if (sheetName === 'trends' && col === 5 && newValue === '키워드 목록에 추가') {
            handleTrendsToKeywords(e, sheet, range);
        }

        // ── keywords 시트: '연관검색어 조사' ──
        else if (sheetName === 'keywords' && col === 2 && newValue === '연관검색어 조사') {
            handleKeywordResearch(e, sheet, range);
        }
    } catch (err) {
        e.source.toast('❌ 오류 발생: ' + err.message);
        Logger.log('Error: ' + err.toString());
    }
}

// ============================================================
// 1️⃣ trends → keywords 복사
// ============================================================
function handleTrendsToKeywords(e, sheet, range) {
    var row = range.getRow();
    var keyword = sheet.getRange(row, 3).getValue(); // C열: 키워드

    if (!keyword) {
        e.source.toast('⚠️ 키워드가 비어있습니다.');
        return;
    }

    // keywords 시트 가져오기
    var kwSheet = e.source.getSheetByName('keywords');
    if (!kwSheet) {
        e.source.toast('❌ keywords 시트를 찾을 수 없습니다.');
        return;
    }

    // 중복 확인
    var kwData = kwSheet.getDataRange().getValues();
    for (var i = 1; i < kwData.length; i++) {
        if (kwData[i][0] == keyword) {
            e.source.toast('ℹ️ 이미 존재하는 키워드: ' + keyword);
            return;
        }
    }

    // keywords 시트에 추가 (상태: 대기)
    var timestamp = new Date();
    kwSheet.appendRow([keyword, '대기', timestamp]);

    e.source.toast('✅ keywords에 추가됨: ' + keyword);
}

// ============================================================
// 2️⃣ keywords: 연관검색어 조사 실행
// ============================================================
function handleKeywordResearch(e, sheet, range) {
    var row = range.getRow();
    var keyword = sheet.getRange(row, 1).getValue(); // A열: 키워드

    if (!keyword) {
        e.source.toast('⚠️ 키워드가 비어있습니다.');
        return;
    }

    e.source.toast('🔍 연관검색어 조사 중: ' + keyword);

    // 1. 연관검색어 조회
    var relatedKeywords = fetchRelatedKeywords(keyword);

    if (relatedKeywords.length === 0) {
        e.source.toast('⚠️ 연관검색어가 없습니다: ' + keyword);
        sheet.getRange(row, 2).setValue('연관검색어 조사 완료'); // 결과 없어도 완료 처리
        sheet.getRange(row, 3).setValue(new Date()); // 작업 시간 업데이트
        return;
    }

    // 2. topics 시트 가져오기
    var topicsSheet = e.source.getSheetByName('topics');
    if (!topicsSheet) {
        e.source.toast('❌ topics 시트를 찾을 수 없습니다.');
        return;
    }

    // 3. 각 연관검색어에 대해 블로그 URL 수집 → topics에 추가
    var addedCount = 0;
    for (var i = 0; i < relatedKeywords.length; i++) {
        var relKw = relatedKeywords[i];

        try {
            var blogUrl = fetchBlogUrl(relKw);

            // topics 시트에 추가
            // 헤더: blog, subject, keywords, 참고/지시 사항, 상태, 이미지 생성, 참고 URL, 발행 시간, 로그
            topicsSheet.appendRow([
                'naver',    // blog
                keyword,    // subject (원본 키워드)
                relKw,      // keywords (연관검색어)
                '',         // 참고/지시 사항
                '대기',     // 상태
                'No',       // 이미지 생성
                blogUrl,    // 참고 URL
                '',         // 발행 시간
                ''          // 로그
            ]);

            addedCount++;

            // API 레이트 리밋 방지 (100ms 대기)
            Utilities.sleep(100);
        } catch (err) {
            Logger.log('Error processing ' + relKw + ': ' + err.toString());
        }
    }

    // 4. 상태 업데이트: 연관검색어 조사 완료
    sheet.getRange(row, 2).setValue('연관검색어 조사 완료');
    sheet.getRange(row, 3).setValue(new Date()); // 작업 시간 업데이트

    e.source.toast('✅ 완료! ' + addedCount + '개의 토픽이 추가됨 (' + keyword + ')');
}

// ============================================================
// 🔍 네이버 연관검색어 API
// ============================================================
function fetchRelatedKeywords(keyword) {
    try {
        var url = 'https://ac.search.naver.com/nx/ac?q=' + encodeURIComponent(keyword) + '&st=1000&frm=nv&ans=1';
        var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        var data = JSON.parse(response.getContentText());

        var items = data.items && data.items[0];
        if (!items || !Array.isArray(items)) return [];

        return items.map(function (item) { return item[0]; });
    } catch (e) {
        Logger.log('연관검색어 API 오류: ' + e.toString());
        return [];
    }
}

// ============================================================
// 🔍 네이버 블로그 검색 API
// ============================================================
function fetchBlogUrl(keyword) {
    try {
        var props = PropertiesService.getScriptProperties();
        var clientId = props.getProperty('NAVER_CLIENT_ID');
        var clientSecret = props.getProperty('NAVER_CLIENT_SECRET');

        if (!clientId || !clientSecret) {
            Logger.log('⚠️ NAVER API 키가 설정되지 않았습니다. 스크립트 속성을 확인하세요.');
            return '';
        }

        var url = 'https://openapi.naver.com/v1/search/blog.json?query=' + encodeURIComponent(keyword) + '&display=5&sort=sim';
        var options = {
            headers: {
                'X-Naver-Client-Id': clientId,
                'X-Naver-Client-Secret': clientSecret
            },
            muteHttpExceptions: true
        };

        var response = UrlFetchApp.fetch(url, options);
        var data = JSON.parse(response.getContentText());

        if (data && data.items && data.items.length > 0) {
            // postdate 기준 최신순 정렬 후 첫 번째 링크 반환
            var items = data.items.sort(function (a, b) {
                return Number(b.postdate) - Number(a.postdate);
            });
            var link = items[0].link || '';

            // 🔧 [Added] 네이버 블로그 주소인 경우 모바일 주소로 변환
            if (link && link.indexOf('blog.naver.com') !== -1 && link.indexOf('m.blog.naver.com') === -1) {
                link = link.replace('http://blog.naver.com', 'https://m.blog.naver.com')
                    .replace('https://blog.naver.com', 'https://m.blog.naver.com');
            }
            return link;
        }

        return '';
    } catch (e) {
        Logger.log('블로그 검색 API 오류 (' + keyword + '): ' + e.toString());
        return '';
    }
}
