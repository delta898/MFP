/**
 * Google Sheets Apps Script for NaverAutoBlog Automation
 * 
 * 기능:
 * 'trends' 시트에서 '동작/상태'가 '연관검색어 조사 준비 완료'로 변경되면,
 * 해당 키워드를 'keywords' 시트로 자동으로 복사합니다.
 * 
 * 사용법:
 * 1. 구글 스프레드시트에서 [확장 프로그램] > [Apps Script] 클릭
 * 2. 이 코드를 복사해서 붙여넣기
 * 3. [저장] 아이콘 클릭 (프로젝트 이름은 아무거나 무관)
 * 4. 시트로 돌아가서 테스트
 */

function onEdit(e) {
    // 이벤트 객체가 없으면 종료 (스크립트 에디터에서 직접 실행 시 방지)
    if (!e) return;

    var sourceSheet = e.source.getActiveSheet();
    var sheetName = sourceSheet.getName();

    // 1. 'trends' 시트인지 확인
    if (sheetName !== 'trends') return;

    // 2. 편집된 컬럼이 '동작/상태' (E열, 인덱스 5)인지 확인
    var range = e.range;
    var col = range.getColumn();
    if (col !== 5) return;

    // 3. 변경된 값이 '연관검색어 조사 준비 완료'인지 확인
    // (드롭다운 값과 정확히 일치해야 함)
    var matchedStatus = '연관검색어 조사 준비 완료';

    // e.value는 문자열로 전달됨. 셀을 지웠을 때는 undefined일 수 있음.
    if (e.value !== matchedStatus) return;

    // 4. 해당 행의 '키워드' (C열, 인덱스 3) 가져오기
    var row = range.getRow();
    var keywordCell = sourceSheet.getRange(row, 3);
    var keyword = keywordCell.getValue();

    if (!keyword) {
        if (e.source) e.source.toast('⚠️ 키워드가 비어있어 작업을 중단합니다.');
        return;
    }

    // 5. 'keywords' 시트 가져오기
    var targetSheet = e.source.getSheetByName('keywords');
    if (!targetSheet) {
        if (e.source) e.source.toast('❌ keywords 시트를 찾을 수 없습니다.');
        return;
    }

    // 6. 중복 확인 (이미 있는 키워드면 추가 안 함)
    // 데이터가 많으면 느려질 수 있으므로, 최근 100행만 검사하거나 건너뛰는 것도 방법
    var keywordsData = targetSheet.getDataRange().getValues();
    for (var i = 1; i < keywordsData.length; i++) {
        if (keywordsData[i][0] == keyword) { // A열(인덱스 0)이 키워드라고 가정
            if (e.source) e.source.toast('ℹ️ 이미 keywords 시트에 존재하는 키워드입니다: ' + keyword);
            return;
        }
    }

    // 7. keywords 시트에 추가
    // 포맷: [keyword, '연관검색어 조사 준비 완료', 타임스탬프]
    // 주의: 여기서 '완료'가 아니라 '준비 완료'로 넣어야 Node.js 스크립트가 인식하고 작업을 수행합니다.
    var timestamp = new Date();
    targetSheet.appendRow([keyword, matchedStatus, timestamp]);

    // 8. 알림 표시
    if (e.source) e.source.toast('✅ keywords 시트에 추가됨: ' + keyword);
}
