export type SearchAdRow = Record<string, unknown>;

export function normalizeKeyword(value: unknown) {
  return String(value || "").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

export function parseCount(value: unknown): { count: number | null; raw: string | null } {
  if (value === null || value === undefined) return { count: null, raw: null };
  const raw = String(value);
  if (raw.trim().startsWith("<")) return { count: 5, raw };
  const parsed = Number.parseInt(raw.replace(/,/g, "").trim(), 10);
  return { count: Number.isFinite(parsed) ? parsed : null, raw };
}

export function totalVolume(row: SearchAdRow) {
  const pc = parseCount(row?.monthlyPcQcCnt);
  const mobile = parseCount(row?.monthlyMobileQcCnt);
  return {
    total: pc.count !== null && mobile.count !== null ? pc.count + mobile.count : null,
    pc: pc.count,
    mobile: mobile.count,
    raw: { pc: pc.raw, mobile: mobile.raw },
  };
}

function relatedSubjectScore(item: { row: SearchAdRow; source_input_keywords: string[] }, subject: string) {
  const keyword = normalizeKeyword(item.row?.relKeyword);
  const tokens = String(subject || "").toLocaleLowerCase("ko-KR").match(/[0-9a-z가-힣]{2,}/g) || [];
  let score = 0;
  for (const token of tokens) {
    if (keyword.includes(normalizeKeyword(token))) score += 2;
  }
  for (const source of item.source_input_keywords) {
    const normalizedSource = normalizeKeyword(source);
    if (keyword.includes(normalizedSource) || normalizedSource.includes(keyword)) score += 3;
  }
  return score;
}

export function prepareKeywordRows(options: {
  keywords: string[];
  subject: string;
  rowsByKeyword: Map<string, SearchAdRow[]>;
  relatedAssist: boolean;
  relatedLimit: number;
  minSearchVolume: number;
}) {
  const inputKeys = new Set(options.keywords.map(normalizeKeyword));
  const inputRows = new Map<string, SearchAdRow>();
  const relatedPool = new Map<string, { row: SearchAdRow; source_input_keywords: string[] }>();

  for (const keyword of options.keywords) {
    const rows = options.rowsByKeyword.get(normalizeKeyword(keyword)) || [];
    const primary = rows.find((row) => normalizeKeyword(row?.relKeyword) === normalizeKeyword(keyword))
      || rows[0]
      || { relKeyword: keyword };
    inputRows.set(normalizeKeyword(keyword), primary);
    if (!options.relatedAssist) continue;

    for (const row of rows) {
      const candidate = String(row?.relKeyword || "").trim();
      const key = normalizeKeyword(candidate);
      if (!candidate || inputKeys.has(key)) continue;
      const existing = relatedPool.get(key);
      if (existing) {
        if (!existing.source_input_keywords.includes(keyword)) existing.source_input_keywords.push(keyword);
      } else {
        relatedPool.set(key, { row, source_input_keywords: [keyword] });
      }
    }
  }

  const relatedRows = Array.from(relatedPool.values())
    .filter((item) => {
      const volume = totalVolume(item.row).total;
      return volume !== null && volume >= options.minSearchVolume;
    })
    .sort((a, b) => {
      const relevance = relatedSubjectScore(b, options.subject) - relatedSubjectScore(a, options.subject);
      if (relevance !== 0) return relevance;
      return (totalVolume(b.row).total ?? -1) - (totalVolume(a.row).total ?? -1);
    })
    .slice(0, options.relatedLimit);

  return { inputRows, relatedRows };
}

function competitionLevel(documentsPerSearch: number) {
  if (documentsPerSearch < 1) return "낮음";
  if (documentsPerSearch < 5) return "보통";
  return "높음";
}

function buildCandidate(
  row: SearchAdRow,
  blogResult: { total: number | null; error: string | null },
  sourceInputKeywords: string[],
  isInputKeyword: boolean,
  minSearchVolume: number,
) {
  const volume = totalVolume(row);
  const mobileShare = volume.mobile !== null && volume.total
    ? Math.round((volume.mobile / volume.total) * 10000) / 100
    : null;
  const documentsPerSearch = volume.total !== null && blogResult.total !== null
    ? blogResult.total / Math.max(volume.total, 1)
    : null;
  const eligibilityReasons: string[] = [];
  if (volume.total === null) eligibilityReasons.push("monthly_search_volume_unavailable");
  else if (volume.total < minSearchVolume) eligibilityReasons.push("below_minimum_search_volume");
  if (blogResult.total === null) eligibilityReasons.push("blog_document_count_unavailable");

  return {
    keyword: String(row?.relKeyword || ""),
    source_input_keywords: sourceInputKeywords,
    is_input_keyword: isInputKeyword,
    monthly_search_volume: volume,
    mobile_share_percent: mobileShare,
    blog_document_count: blogResult.total,
    document_count_note: blogResult.error,
    competition_strength: documentsPerSearch === null
      ? { status: "incomplete", documents_per_monthly_search: null, level: null }
      : {
        status: "complete",
        documents_per_monthly_search: Number(documentsPerSearch.toFixed(6)),
        level: competitionLevel(documentsPerSearch),
      },
    opportunity: documentsPerSearch === null
      ? { status: "incomplete", monthly_searches_per_document: null }
      : {
        status: "complete",
        monthly_searches_per_document: Number((volume.total! / Math.max(blogResult.total!, 1)).toFixed(6)),
      },
    ad_competition_index: row?.compIdx || null,
    recommendation_eligibility: {
      eligible: eligibilityReasons.length === 0,
      reasons: eligibilityReasons,
    },
  };
}

function compareCandidates(a: ReturnType<typeof buildCandidate>, b: ReturnType<typeof buildCandidate>) {
  if (a.recommendation_eligibility.eligible !== b.recommendation_eligibility.eligible) {
    return a.recommendation_eligibility.eligible ? -1 : 1;
  }
  const opportunity = (b.opportunity.monthly_searches_per_document ?? -1)
    - (a.opportunity.monthly_searches_per_document ?? -1);
  if (opportunity !== 0) return opportunity;
  const volume = (b.monthly_search_volume.total ?? -1) - (a.monthly_search_volume.total ?? -1);
  if (volume !== 0) return volume;
  const mobile = (b.mobile_share_percent ?? -1) - (a.mobile_share_percent ?? -1);
  if (mobile !== 0) return mobile;
  return a.keyword.localeCompare(b.keyword, "ko-KR");
}

export function buildKeywordAnalysis(options: {
  keywords: string[];
  subject: string;
  inputRows: Map<string, SearchAdRow>;
  relatedRows: Array<{ row: SearchAdRow; source_input_keywords: string[] }>;
  blogTotals: Map<string, { total: number | null; error: string | null }>;
  minSearchVolume: number;
  relatedAssist: boolean;
  relatedLimit: number;
}) {
  const resultFor = (keyword: string) => options.blogTotals.get(normalizeKeyword(keyword))
    || { total: null, error: "Blog document count unavailable" };
  const inputCandidates = options.keywords.map((keyword) => buildCandidate(
    options.inputRows.get(normalizeKeyword(keyword)) || { relKeyword: keyword },
    resultFor(keyword),
    [keyword],
    true,
    options.minSearchVolume,
  )).sort(compareCandidates);
  const relatedCandidates = options.relatedRows.map((item) => buildCandidate(
    item.row,
    resultFor(String(item.row?.relKeyword || "")),
    item.source_input_keywords,
    false,
    options.minSearchVolume,
  )).sort(compareCandidates);
  const eligibleInputs = inputCandidates.filter((item) => item.recommendation_eligibility.eligible);
  const eligibleRelated = relatedCandidates.filter((item) => item.recommendation_eligibility.eligible);
  let selected = inputCandidates[0];
  let selectionReason = "최소 검색량 기준을 충족하는 후보가 없어 입력 키워드 중 최선 후보 유지";
  if (eligibleInputs.length > 0) {
    selected = eligibleInputs[0];
    selectionReason = "입력된 키워드 중 검색 수요와 문서 경쟁도 기준 최우선 추천";
  } else if (options.relatedAssist && eligibleRelated.length > 0) {
    selected = eligibleRelated[0];
    selectionReason = "입력 키워드의 기준 미달로 인해 최적 연관 키워드 추천";
  }
  return {
    subject: options.subject,
    selected_keyword: selected?.keyword || options.keywords[0],
    selection_reason: selectionReason,
    input_keywords: inputCandidates,
    related_candidates: relatedCandidates,
    candidate_pool_size: inputCandidates.length + relatedCandidates.length,
    settings: {
      related_assist: options.relatedAssist,
      related_limit: options.relatedLimit,
      candidate_limit: options.relatedLimit,
      min_search_volume: options.minSearchVolume,
    },
  };
}
