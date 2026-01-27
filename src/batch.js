const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const Core = require('./core');
const CONFIG = require('../config/settings');

// 파일 경로
const EXCEL_FILE = path.join(__dirname, '../jobs.xlsx');

// 헬퍼: 엑셀 날짜 파싱
function parseExcelDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string') return new Date(value);
    return null;
}

// 헬퍼: Boolean 변환
function parseBool(value) {
    if (value === true || value === 'true' || value === 'TRUE') return true;
    if (value === 'O' || value === 'o' || value === 'Yes') return true;
    if (value === false || value === 'false' || value === 'FALSE') return false;
    if (value === 'X' || value === 'x' || value === 'No') return false;
    return true; // 기본값 True
}

async function runBatch() {
    console.log("🏭 [Batch Manager] 엑셀 기반 일괄 작업을 시작합니다...");

    if (!fs.existsSync(EXCEL_FILE)) {
        console.error(`❌ 파일을 찾을 수 없습니다: ${EXCEL_FILE}`);
        console.log("   👉 프로젝트 폴더에 'jobs.xlsx' 파일을 만들어주세요.");
        return;
    }

    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.readFile(EXCEL_FILE);
    } catch (e) {
        console.error("❌ 엑셀 파일을 읽을 수 없습니다. 혹시 파일이 열려 있나요?");
        return;
    }

    const worksheet = workbook.getWorksheet(1);
    let processedCount = 0;

    console.log(`📋 총 ${worksheet.rowCount - 1}개의 행을 스캔합니다...`);

    // 2번째 줄부터 데이터 순회
    for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        
        // --- 1. 데이터 읽기 ---
        let subject = row.getCell(1).text?.trim();       // A: Subject
        let keywordStr = row.getCell(2).text?.trim();    // B: Keywords
        const instruction = row.getCell(3).text?.trim(); // C: Instruction
        const statusCell = row.getCell(4);               // D: Status
        const status = statusCell.text?.trim()?.toLowerCase();
        
        const imageGenVal = row.getCell(5).value;        // E: Image Gen
        const imageCountVal = row.getCell(6).value;      // F: Image Count
        const refUrl = row.getCell(7).text?.trim();      // G: Ref URL
        const scheduleTimeVal = row.getCell(8).value;    // H: Schedule Time
        
        const publishedDateCell = row.getCell(9);        // I: Published Date
        const resultLogCell = row.getCell(10);           // J: Result Log

        // [필터 1] 유효성 검사 (주제, 키워드, URL 셋 다 없으면 빈 줄로 간주)
        if (!subject && !keywordStr && !refUrl) continue;

        // [필터 2] 이미 완료된 작업 스킵
        if (status === 'done') continue;

        // [필터 3] 예약 시간 체크
        const scheduleTime = parseExcelDate(scheduleTimeVal);
        const now = new Date();
        if (scheduleTime && scheduleTime > now) {
            console.log(`⏳ [Skip] 예약 대기 중 (Row ${i}): ${scheduleTime.toLocaleString()}`);
            continue;
        }

        // --- 2. 작업 시작 ---
        console.log(`\n▶️ [Processing] Row ${i} 작업 시작...`);
        
        // 상태 업데이트 (중복 방지)
        statusCell.value = 'Processing';
        await workbook.xlsx.writeFile(EXCEL_FILE);

        try {
            // Job Data 구성
            const jobData = {
                subject: subject || "", // 없으면 빈 문자열 (Core가 채워줌)
                keywords: keywordStr ? keywordStr.split(',').map(k => k.trim()) : [],
                content_guide: {
                    additional_instructions: instruction || "",
                    reference_urls: refUrl ? [refUrl] : []
                },
                image_options: {
                    generate: parseBool(imageGenVal),
                    count: imageCountVal ? parseInt(imageCountVal) : 4,
                    style: "photorealistic"
                }
            };

            // 🔥 Core 실행 (Core가 제목/키워드 결정해서 리턴함)
            const result = await Core.generateContent(jobData);
            
            // 이미지 생성
            await Core.prepareImages(result.targetDir, jobData);
            
            // 블로그 발행
            await Core.publishToBlog(result.targetDir);

            // --- 3. 엑셀 업데이트 (중요!) ---
            // Core가 확정한 제목과 키워드를 엑셀에 다시 적어줍니다.
            row.getCell(1).value = result.finalSubject;
            row.getCell(2).value = result.finalKeywords.join(', ');

            statusCell.value = 'Done';
            publishedDateCell.value = new Date();
            resultLogCell.value = `Success: ${path.basename(result.targetDir)}`;
            
            console.log(`✅ [Success] Row ${i} 완료!`);
            processedCount++;

        } catch (error) {
            console.error(`❌ [Error] Row ${i} 실패:`, error.message);
            statusCell.value = 'Error';
            resultLogCell.value = error.message;
        }

        // 엑셀 저장 (파일 보호를 위해 매번 저장)
        try {
            await workbook.xlsx.writeFile(EXCEL_FILE);
        } catch (saveErr) {
            console.error("⚠️ 엑셀 저장 실패 (파일을 닫아주세요):", saveErr.message);
        }

        // ✅ 수정된 부분: 초(Sec)를 가져와서 밀리초(ms)로 변환
        const seconds = CONFIG.BATCH_INTERVAL_SECONDS || 60; // 설정 없으면 기본 60초
        const waitTimeMs = seconds * 1000; 

        console.log(`⏳ [Wait] 다음 작업 전 ${seconds}초간 대기합니다...`);
        
        // 실제 프로그램은 밀리초로 대기
        await new Promise(r => setTimeout(r, waitTimeMs));
    }

    if (processedCount === 0) console.log("\n💤 처리할 작업이 없습니다.");
    else console.log(`\n🎉 총 ${processedCount}개의 작업을 처리했습니다.`);
    }

    if (processedCount === 0) console.log("\n💤 처리할 작업이 없습니다.");
    else console.log(`\n🎉 총 ${processedCount}개의 작업을 처리했습니다.`);
}

// 메인 실행
const main = async () => {
    if (!fs.existsSync(CONFIG.AUTH_FILE_PATH)) {
        console.error("🚨 [Error] 로그인 정보(auth.json)가 없습니다. 'npm run login'을 먼저 실행하세요.");
        return;
    }
    await runBatch();
};

main();
