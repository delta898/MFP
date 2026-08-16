import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildKeywordAnalysis,
  normalizeKeyword,
  prepareKeywordRows,
} from "./keyword-analysis.ts";

Deno.test("related candidates are deduplicated and limited across all input keywords", () => {
  const rowsByKeyword = new Map([
    [normalizeKeyword("제주 여행"), [
      { relKeyword: "제주 여행", monthlyPcQcCnt: 1000, monthlyMobileQcCnt: 2000 },
      { relKeyword: "제주 맛집", monthlyPcQcCnt: 500, monthlyMobileQcCnt: 1000 },
      { relKeyword: "제주 가족 여행", monthlyPcQcCnt: 700, monthlyMobileQcCnt: 1200 },
    ]],
    [normalizeKeyword("제주 맛집"), [
      { relKeyword: "제주 맛집", monthlyPcQcCnt: 500, monthlyMobileQcCnt: 1000 },
      { relKeyword: "제주 가족 여행", monthlyPcQcCnt: 700, monthlyMobileQcCnt: 1200 },
      { relKeyword: "제주 카페", monthlyPcQcCnt: 200, monthlyMobileQcCnt: 300 },
    ]],
  ]);
  const prepared = prepareKeywordRows({
    keywords: ["제주 여행", "제주 맛집"],
    subject: "제주 가족 여행 코스",
    rowsByKeyword,
    relatedAssist: true,
    relatedLimit: 2,
    minSearchVolume: 300,
  });
  assertEquals(prepared.relatedRows.length, 2);
  assertEquals(prepared.relatedRows[0].row.relKeyword, "제주 가족 여행");
  assertEquals(prepared.relatedRows[0].source_input_keywords, ["제주 여행", "제주 맛집"]);
});

Deno.test("analysis selects the eligible candidate with the best opportunity", () => {
  const keywords = ["제주 여행"];
  const inputRows = new Map([[normalizeKeyword("제주 여행"), {
    relKeyword: "제주 여행",
    monthlyPcQcCnt: 50,
    monthlyMobileQcCnt: 100,
  }]]);
  const relatedRows = [{
    row: { relKeyword: "제주 가족 여행", monthlyPcQcCnt: 1000, monthlyMobileQcCnt: 3000 },
    source_input_keywords: ["제주 여행"],
  }];
  const blogTotals = new Map([
    [normalizeKeyword("제주 여행"), { total: 30000, error: null }],
    [normalizeKeyword("제주 가족 여행"), { total: 4000, error: null }],
  ]);
  const result = buildKeywordAnalysis({
    keywords,
    subject: "제주 여행",
    inputRows,
    relatedRows,
    blogTotals,
    minSearchVolume: 300,
    relatedAssist: true,
    relatedLimit: 8,
  });
  assertEquals(result.selected_keyword, "제주 가족 여행");
  assertEquals(result.related_candidates[0].competition_strength.level, "보통");
});
