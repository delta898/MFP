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
 * 4. 상단 함수 드롭다운에서 'setupTrigger' 선택 후 ▶ 실행 (최초 1회)
 *    - 권한 승인 팝업이 뜨면 '허용'
 * 5. 시트로 돌아가서 테스트!
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
        // ── trends 시트: '키워드 목록에 추가' OR '연관검색어 조사' ──
        if (sheetName === 'trends' && col === 5) {
            if (newValue === '키워드 목록에 추가') {
                handleTrendsToKeywords(e, sheet, range);
            } else if (newValue === '연관검색어 조사') {
                handleKeywordResearch(e, sheet, range); // trends 시트에서도 바로 호출
            }
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

    // trends 시트 상태 업데이트 (완료 표시)
    sheet.getRange(row, 5).setValue('키워드 목록 추가 완료');

    e.source.toast('✅ keywords에 추가됨: ' + keyword);
}

// ============================================================
// 2️⃣ keywords & trends: 연관검색어 조사 실행
// ============================================================
function handleKeywordResearch(e, sheet, range) {
    var sheetName = sheet.getName();
    var row = range.getRow();
    var keyword = '';
    var statusCol = 0;
    var timeCol = 0;

    // 시트별 컬럼 위치 설정
    if (sheetName === 'keywords') {
        keyword = sheet.getRange(row, 1).getValue(); // A열
        statusCol = 2; // B열
        timeCol = 3;   // C열
    } else if (sheetName === 'trends') {
        keyword = sheet.getRange(row, 3).getValue(); // C열
        statusCol = 5; // E열
        // trends는 별도 시간 업데이트 컬럼 없음 (A열은 트렌드 날짜이므로 유지)
    }

    if (!keyword) {
        e.source.toast('⚠️ 키워드가 비어있습니다.');
        return;
    }

    e.source.toast('🔍 연관검색어 조사 중: ' + keyword);

    // 1. 연관검색어 조회
    var relatedKeywords = fetchRelatedKeywords(keyword);

    if (relatedKeywords.length === 0) {
        e.source.toast('⚠️ 연관검색어가 없습니다: ' + keyword);
        if (statusCol > 0) sheet.getRange(row, statusCol).setValue('연관검색어 조사 완료');
        if (timeCol > 0) sheet.getRange(row, timeCol).setValue(new Date());
        return;
    }

    // 2. topics 시트 가져오기
    var topicsSheet = e.source.getSheetByName('topics');
    if (!topicsSheet) {
        e.source.toast('❌ topics 시트를 찾을 수 없습니다.');
        return;
    }

    // 3. 각 연관검색어에 대해 topics에 추가 (블로그 URL 수집 없음)
    var addedCount = 0;
    for (var i = 0; i < relatedKeywords.length; i++) {
        var relKw = relatedKeywords[i];

        try {
            // topics 시트에 추가
            // 헤더: blog, subject, keywords, 참고/지시 사항, 상태, 이미지 처리, 외부 참고 여부, 참고 URL, 발행 시간, 로그
            topicsSheet.appendRow([
                'naver',    // blog
                keyword,    // subject (원본 키워드)
                relKw,      // keywords (연관검색어)
                '',         // 참고/지시 사항
                '대기',     // 상태
                '이미지 생성', // 이미지 처리
                'Yes',      // 외부 참고 여부
                '',         // 참고 URL (배치 실행 시 자동 수집)
                '',         // 발행 시간
                ''          // 로그
            ]);

            addedCount++;
        } catch (err) {
            Logger.log('Error processing ' + relKw + ': ' + err.toString());
        }
    }

    // 4. 상태 업데이트: 연관검색어 조사 완료
    if (statusCol > 0) sheet.getRange(row, statusCol).setValue('연관검색어 조사 완료');
    if (timeCol > 0) sheet.getRange(row, timeCol).setValue(new Date());

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
