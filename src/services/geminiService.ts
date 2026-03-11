import { GoogleGenAI } from '@google/genai';
import type { SimulationParams, FleetVessel, Scenario, OntologyObject, OntologyLink } from '../types';

export const LOADING_MESSAGES = [
    '보안 해양 온톨로지에 연결 중...',
    '제미나이가 온톨로지 데이터를 분석 중입니다...',
    'WS 운임 스프레드 시뮬레이션 실행 중...',
    '테일 리스크 시나리오를 연산 중입니다...',
    '선대 리스크 프로파일 교차 검증 중...',
    '경영진 브리핑 보고서를 생성 중입니다...',
];

export const AIP_LOADING_MESSAGES = [
    '온톨로지 그래프 스냅샷 수집 중...',
    '고위험 객체 및 전파 경로 분석 중...',
    '리스크 퀀트 모델에 데이터 입력 중...',
    'Gemini AI 스트리밍 분석 시작...',
    '전사적 리스크 매핑 실행 중...',
    '재무적 타격 예상치 산출 중...',
    'Action Plan 도출 중...',
];

// ============================================================
// EXISTING: Marp Briefing Context Builder
// ============================================================

export function generateBriefingContext(
    activeScenario: Scenario,
    params: SimulationParams,
    fleetData: FleetVessel[]
): string {
    const criticalVessels = fleetData.filter(v => v.riskLevel === 'Critical' || v.riskLevel === 'High');

    const context = {
        scenario: {
            name: activeScenario.name,
            description: activeScenario.description,
        },
        simulation_parameters: {
            vlsfo_price_usd_per_mt: params.vlsfoPrice,
            news_sentiment_score: params.newsSentimentScore,
            awrp_rate_pct: params.awrpRate,
            interest_rate_pct: params.interestRate,
            spread_volatility: params.newsSentimentScore > 70 ? 'EXTREME' : params.newsSentimentScore > 40 ? 'HIGH' : 'NORMAL',
        },
        high_risk_fleet: criticalVessels.map(v => ({
            vessel_name: v.vessel_name,
            vessel_type: v.vessel_type,
            location: v.location,
            risk_level: v.riskLevel,
            voyage: `${v.voyage_info.departure_port} → ${v.voyage_info.destination_port}`,
            sailed_days: v.voyage_info.sailed_days,
            plan_days: v.voyage_info.plan_days,
            fuel_remaining_mt: v.consumption_and_rob.fo_rob,
            cii_rating: v.compliance.cii_rating,
        })),
        total_fleet_count: fleetData.length,
        critical_vessel_count: criticalVessels.length,
        analysis_timestamp: new Date().toISOString(),
    };

    return JSON.stringify(context, null, 2);
}

export async function fetchGeminiBriefing(
    apiKey: string,
    contextJSON: string
): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `당신은 글로벌 해운사의 최고경영진(C-Level)을 위한 전문 해양 리스크 분석 AI입니다.
제공된 JSON 컨텍스트 데이터를 분석하여 Marp 마크다운 형식의 긴급 경영환경 브리핑 프레젠테이션을 생성하세요.

### 출력 규칙:
1. 반드시 Marp 마크다운 형식으로 출력 (---로 슬라이드 구분)
2. 첫 슬라이드에 marp: true, theme: default 메타데이터 포함
3. 한국어로 작성
4. 제공된 컨텍스트의 실제 수치를 삽입 (절대 하드코딩하지 말 것)
5. 최소 10가지 이상의 테일 리스크 시나리오를 구체적으로 분석
6. 각 슬라이드에 이모지를 활용하여 시각적 임팩트 극대화
7. 경영진 의사결정에 필요한 구체적 액션 아이템 포함

### 슬라이드 구조:
- 슬라이드 1: 긴급 브리핑 표지 (시나리오 명, 일시, 위험 등급)
- 슬라이드 2: 시장 취약성 요약 (뉴스 불안 지수, VLSFO 가격, 운임 변동성)
- 슬라이드 3: 고위험 선대 현황 (Critical/High 리스크 선박 상세)
- 슬라이드 4-8: 테일 리스크 시나리오 분석 (각 시나리오별 확률, 영향, 대응)
  - 시나리오 예시: 호르무즈 해협 전면 봉쇄, 보험료 폭등, 연료 공급 차질, 용선 계약 위반, 우회 항로 비용 증가, 항만 혼잡, 선원 교체 불가, CII 등급 하락, 자산 가치 급변, 환율 리스크 등
- 슬라이드 9: 재무적 영향 분석 (추가 비용, 매출 영향)
- 슬라이드 10: 긴급 권고사항 및 액션 플랜
- 슬라이드 11: 결론 및 차기 브리핑 일정

이 데이터를 분석해주세요:`;

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro',
        contents: [
            {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\n${contextJSON}` }],
            },
        ],
    });

    const text = response.text;
    if (!text) {
        throw new Error('Gemini API returned empty response');
    }

    // Clean up: remove markdown code fences if Gemini wraps the output
    let cleaned = text.trim();
    if (cleaned.startsWith('```markdown')) {
        cleaned = cleaned.slice('```markdown'.length);
    } else if (cleaned.startsWith('```marp')) {
        cleaned = cleaned.slice('```marp'.length);
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
    }
    return cleaned.trim();
}

// ============================================================
// NEW: AIP Report — Context Aggregation
// ============================================================

export function generateAIPReportContext(
    activeScenario: Scenario,
    params: SimulationParams,
    fleetData: FleetVessel[],
    objects: OntologyObject[],
    links: OntologyLink[],
): string {
    const highRiskObjects = objects.filter(
        o => (o.properties.riskScore as number) >= 40 && o.metadata.status === 'active'
    );

    const objectSummaries = highRiskObjects.map(o => {
        const connectedLinks = links.filter(l => l.sourceId === o.id || l.targetId === o.id);
        return {
            id: o.id,
            type: o.type,
            title: o.title,
            description: o.description,
            riskScore: o.properties.riskScore,
            keyProperties: Object.entries(o.properties)
                .filter(([k]) => !['riskScore'].includes(k))
                .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
            connections: connectedLinks.map(l => ({
                relation: l.relationType,
                weight: l.weight,
                connectedTo: l.sourceId === o.id ? l.targetId : l.sourceId,
                label: l.metadata?.label,
            })),
        };
    });

    const criticalVessels = fleetData.filter(v => v.riskLevel === 'Critical' || v.riskLevel === 'High');

    const context = {
        report_type: 'AIP_RISK_DECISION_REPORT',
        scenario: {
            name: activeScenario.name,
            description: activeScenario.description,
        },
        simulation_parameters: {
            vlsfo_price: params.vlsfoPrice,
            news_sentiment_score: params.newsSentimentScore,
            awrp_rate: params.awrpRate,
            interest_rate: params.interestRate,
            supply_chain_stress: params.supplyChainStress,
            cyber_threat_level: params.cyberThreatLevel,
            natural_disaster_index: params.naturalDisasterIndex,
            pandemic_risk: params.pandemicRisk,
            trade_war_intensity: params.tradeWarIntensity,
            energy_crisis_level: params.energyCrisisLevel,
        },
        ontology_graph_snapshot: {
            total_objects: objects.length,
            total_links: links.length,
            high_risk_objects: objectSummaries,
            object_count_by_type: objects.reduce((acc: Record<string, number>, o) => {
                acc[o.type] = (acc[o.type] || 0) + 1;
                return acc;
            }, {}),
        },
        fleet_risk_summary: {
            total_vessels: fleetData.length,
            critical_count: criticalVessels.filter(v => v.riskLevel === 'Critical').length,
            high_count: criticalVessels.filter(v => v.riskLevel === 'High').length,
            critical_vessels: criticalVessels.map(v => ({
                name: v.vessel_name,
                type: v.vessel_type,
                location: v.location,
                risk: v.riskLevel,
                route: `${v.voyage_info.departure_port} → ${v.voyage_info.destination_port}`,
                fuel_remaining_mt: v.consumption_and_rob.fo_rob,
                cii_rating: v.compliance.cii_rating,
            })),
        },
        analysis_timestamp: new Date().toISOString(),
    };

    return JSON.stringify(context, null, 2);
}

// ============================================================
// NEW: AIP Report — Streaming Generation
// ============================================================

export async function* streamAIPReport(
    apiKey: string,
    contextJSON: string
): AsyncGenerator<string> {
    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `너는 데이터 기반 리스크 퀀트 전략가다. 첨부된 온톨로지 수치 데이터와 파급 효과를 근거로 정밀한 의사결정 보고서를 작성하라.

### 보고서 구조 (반드시 이 순서를 따를 것):

## 📊 Executive Summary
- 현재 시나리오의 핵심 위험 요약 (1-2문단)

## 🔴 전사적 최대 리스크 지점
- 온톨로지 그래프 분석 기반 최대 위험 노드와 전파 경로를 식별
- 각 리스크에 대해 리스크 점수, 영향 범위, 전파 경로를 구체적 수치로 제시
- 최소 5개 이상의 리스크 포인트를 분석

## 💰 재무적 타격 예상치
- 시나리오별 추가 비용 (연료, 보험, 우회 항로, 체선료 등)
- 매출 영향, 자산 가치 변동, 환율 리스크
- 수치를 표 형식으로 정리 (마크다운 테이블 사용)

## ⚡ 즉각 실행 추천 Action Plan
- 우선순위별 즉시 실행 항목 (48시간 이내)
- 중기 대응 전략 (1-4주)
- 장기 리스크 헤지 전략

### 출력 규칙:
1. 한국어로 작성
2. 마크다운 형식 사용 (##, ###, -, **, 테이블 등)
3. 제공된 컨텍스트의 실제 수치와 객체 이름을 반드시 사용 (절대 임의 수치 사용 금지)
4. **매우 중요**: 보고서 본문에서 온톨로지 객체(선박명, 항구명, 이벤트명, 원자재명 등)를 언급할 때는 반드시 [[객체제목]] 형식으로 감싸라. 
   예시: [[Oceanic Titan]], [[호르무즈 해협 위기]], [[VLSFO]], [[Fujairah]], [[보험료 폭등]]
   이 마킹은 시스템에서 데이터 리니지(Data Lineage) 뱃지로 변환된다.
5. 각 섹션에 이모지를 활용하여 시각적 구분
6. 구체적이고 실행 가능한 권고사항 제시

분석할 데이터:`;

    const response = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: [
            {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\n${contextJSON}` }],
            },
        ],
    });

    for await (const chunk of response) {
        const text = chunk.text;
        if (text) {
            yield text;
        }
    }
}

// ============================================================
// NEW: Marp Briefing — Streaming Generation (migrated from App.tsx)
// ============================================================

export async function* streamMarpBriefing(
    apiKey: string,
    contextJSON: string
): AsyncGenerator<string> {
    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `당신은 글로벌 해운사의 최고경영진(C-Level)을 위한 전문 해양 리스크 분석 AI입니다.
제공된 JSON 컨텍스트 데이터를 분석하여 Marp 마크다운 형식의 긴급 경영환경 브리핑 프레젠테이션을 생성하세요.

### 출력 규칙:
1. 반드시 Marp 마크다운 형식으로 출력 (---로 슬라이드 구분)
2. 첫 슬라이드에 marp: true, theme: default 메타데이터 포함
3. 한국어로 작성
4. 제공된 컨텍스트의 실제 수치를 삽입 (절대 하드코딩하지 말 것)
5. 최소 10가지 이상의 테일 리스크 시나리오를 구체적으로 분석
6. 각 슬라이드에 이모지를 활용하여 시각적 임팩트 극대화
7. 경영진 의사결정에 필요한 구체적 액션 아이템 포함

### 슬라이드 구조:
- 슬라이드 1: 긴급 브리핑 표지 (시나리오 명, 일시, 위험 등급)
- 슬라이드 2: 시장 취약성 요약 (뉴스 불안 지수, VLSFO 가격, 운임 변동성)
- 슬라이드 3: 고위험 선대 현황 (Critical/High 리스크 선박 상세)
- 슬라이드 4-8: 테일 리스크 시나리오 분석 (각 시나리오별 확률, 영향, 대응)
- 슬라이드 9: 재무적 영향 분석 (추가 비용, 매출 영향)
- 슬라이드 10: 긴급 권고사항 및 액션 플랜
- 슬라이드 11: 결론 및 차기 브리핑 일정

이 데이터를 분석해주세요:`;

    const response = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: [
            {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\n${contextJSON}` }],
            },
        ],
    });

    let accumulated = '';
    for await (const chunk of response) {
        const text = chunk.text;
        if (text) {
            accumulated += text;
            yield text;
        }
    }

    // No post-processing needed for streaming — caller handles cleanup
}

// ============================================================
// NEW: OSINT Signal Evaluation — LLM-based noise filtering
// ============================================================

export interface SignalEvaluation {
    articleId: string;
    impactScore: number;
    riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
    insight: string;
    ontologyTags: string[];
    dropped: boolean;
}

export async function evaluateNewsSignals(
    apiKey: string,
    articles: { id: string; title: string; description: string; source: string }[],
): Promise<SignalEvaluation[]> {
    if (!apiKey || articles.length === 0) return [];

    const ai = new GoogleGenAI({ apiKey });

    const articlesJSON = articles.map((a, i) => ({
        index: i,
        id: a.id,
        source: a.source,
        title: a.title,
        description: a.description.slice(0, 200),
    }));

    const prompt = `너는 해상 공급망 및 매크로 경제 리스크 퀀트 전략가다. 아래 뉴스들이 글로벌 해운 비즈니스에 미치는 영향을 분석하여 각 기사에 대해:
1) impactScore (0~100): 해운/공급망/에너지/지정학 관점에서의 영향도
2) riskLevel: "Low" / "Medium" / "High" / "Critical" 
3) insight: 1줄짜리 핵심 Actionable Insight (한국어)
4) ontologyTags: 연관된 온톨로지 키워드 배열 (예: ["호르무즈 해협", "유가", "VLCC", "보험료"])

공급망과 완전히 무관하거나 impactScore가 50점 미만인 기사는 dropped: true로 표시.
반드시 JSON 배열로만 응답하라. 다른 텍스트 없이 JSON만.

분석할 뉴스:
${JSON.stringify(articlesJSON, null, 2)}`;

    try {
        // ============================================================
        // FinOps MODEL ROUTING: Real-time news scoring uses the CHEAPEST
        // model (gemini-2.5-flash). Pro models are reserved ONLY for
        // on-demand deep-dive briefings (BriefingModal / AIP Reports).
        // ============================================================
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        // Track API call for FinOps telemetry
        try {
            const { incrementApiCallCount } = await import('./newsService');
            incrementApiCallCount();
        } catch { /* newsService may not be loaded yet */ }

        const text = response.text || '';
        // Extract JSON from response (handle markdown code fences)
        let jsonStr = text.trim();
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
        else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
        if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
        jsonStr = jsonStr.trim();

        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) return [];

        return parsed.map((item: any, i: number) => ({
            articleId: item.id || articles[i]?.id || '',
            impactScore: Math.max(0, Math.min(100, Number(item.impactScore) || 0)),
            riskLevel: (['Low', 'Medium', 'High', 'Critical'].includes(item.riskLevel) ? item.riskLevel : 'Low') as SignalEvaluation['riskLevel'],
            insight: String(item.insight || ''),
            ontologyTags: Array.isArray(item.ontologyTags) ? item.ontologyTags.map(String) : [],
            dropped: item.dropped === true || (Number(item.impactScore) || 0) < 50,
        }));
    } catch (err) {
        console.warn('[GeminiService] News evaluation failed:', err);
        return [];
    }
}

// ============================================================
// GATE 1: FLASH TRIAGE — Ultra-low-cost summary + criticality
// Called when Persistence Tracker escalates (keyword persists ≥30min)
// Model: gemini-2.5-flash (cheapest, fastest)
// ============================================================

export interface FlashTriageResult {
    summary: string;       // 3-sentence summary of the crisis
    isCritical: boolean;   // True if full ontology/scenario re-evaluation needed
}

export async function triageWithFlash(
    apiKey: string,
    articles: { title: string; description: string; source: string; publishedAt: string }[],
): Promise<FlashTriageResult> {
    const ai = new GoogleGenAI({ apiKey });

    const articleBlock = articles.map((a, i) =>
        `[${i + 1}] ${a.source} | ${a.publishedAt}\n제목: ${a.title}\n내용: ${a.description}`
    ).join('\n\n');

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
            role: 'user',
            parts: [{
                text: `너는 1차 정보 분석관이다. 이 30분간 누적된 갈등 데이터를 3문장으로 요약하고, 이것이 전사 공급망 및 온톨로지 시나리오를 전면 수정해야 할 '핵심 사태(Critical Escalation)'인지 True/False로 판단하라.

판단 기준:
- 물리적 충돌(미사일, 공격, 나포)이 실제 발생했거나 임박한 경우 → Critical
- 국제기구(UKMTO, IMO)가 공식 경고를 발령한 경우 → Critical
- 유가/보험료가 10% 이상 급등한 경우 → Critical
- 단순 긴장 고조, 성명 발표, 정치적 수사 → Not Critical

최근 30분간 수집된 기사:
${articleBlock}

JSON 응답만 반환하라:
{ "summary": "3문장 요약...", "isCritical": true/false }` }],
        }],
    });

    const text = response.text || '';
    let jsonStr = text.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
    jsonStr = jsonStr.trim();

    try {
        const parsed = JSON.parse(jsonStr);
        return {
            summary: parsed.summary || 'Unable to parse summary',
            isCritical: parsed.isCritical === true,
        };
    } catch {
        console.warn('[GeminiService] Flash triage parse error, raw:', text);
        return { summary: text.slice(0, 200), isCritical: false };
    }
}


// ============================================================
// GATE 2: PRO ESCALATION — Full ontology + scenario update
// Called ONLY when Flash returns isCritical: true
// Model: gemini-2.5-pro (most capable)
// ============================================================

export interface ProEscalationResult {
    briefingText: string;                    // Full situation briefing (Korean)
    ontologyUpdates: Array<{
        nodeId: string;                      // e.g. 'insurance-war-risk', 'commodity-brent'
        nodeTitle: string;                   // human label
        propertyKey: string;                 // e.g. 'riskScore', 'currentPrice'
        newValue: string | number | boolean;
        reason: string;                      // why this node is affected
    }>;
    riskLevel: 'Medium' | 'High' | 'Critical';
    impactSummary: string;                   // 1-line Korean summary for UI toast
}

export async function escalateWithPro(
    apiKey: string,
    flashSummary: string,
    ontologyState: { objects: OntologyObject[]; links: OntologyLink[] },
): Promise<ProEscalationResult> {
    const ai = new GoogleGenAI({ apiKey });

    // Compact ontology JSON — only relevant fields
    const compactObjects = ontologyState.objects.map(o => ({
        id: o.id,
        type: o.type,
        title: o.title,
        properties: o.properties,
    }));

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [{
            role: 'user',
            parts: [{
                text: `너는 최고 작전 통제관이다. 1차 분석관이 요약한 '핵심 사태'를 바탕으로 다음을 수행하라:

## 1차 요약 (Flash 분석관 보고):
${flashSummary}

## 현재 온톨로지 전역 상태:
${JSON.stringify(compactObjects, null, 2)}

## 지시사항:
1. '현재 상황 묘사 브리핑' 텍스트를 한국어로 작성하라. (5-8문장, 위기 상황의 전개, 영향, 전망 포함)
2. 타격받는 온톨로지 노드와 변경되어야 할 수치를 도출하라.
   - 가능한 nodeId: ${compactObjects.map(o => `"${o.id}"`).join(', ')}
   - 각 노드의 어떤 propertyKey를 어떤 값으로 변경해야 하는지, 그리고 이유를 작성
3. 전체적인 위험 수준을 Medium/High/Critical로 판단
4. 1줄 한국어 요약 (UI 토스트용)

JSON 응답만 반환:
{
  "briefingText": "한국어 브리핑...",
  "ontologyUpdates": [
    { "nodeId": "...", "nodeTitle": "...", "propertyKey": "...", "newValue": ..., "reason": "..." }
  ],
  "riskLevel": "Critical",
  "impactSummary": "1줄 요약..."
}` }],
        }],
    });

    const text = response.text || '';
    let jsonStr = text.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
    jsonStr = jsonStr.trim();

    try {
        const parsed = JSON.parse(jsonStr);
        return {
            briefingText: parsed.briefingText || flashSummary,
            ontologyUpdates: Array.isArray(parsed.ontologyUpdates) ? parsed.ontologyUpdates : [],
            riskLevel: (['Medium', 'High', 'Critical'].includes(parsed.riskLevel)) ? parsed.riskLevel : 'High',
            impactSummary: parsed.impactSummary || '위기 사태 업데이트 완료',
        };
    } catch {
        console.warn('[GeminiService] Pro escalation parse error, raw:', text);
        return {
            briefingText: flashSummary,
            ontologyUpdates: [],
            riskLevel: 'High',
            impactSummary: 'Pro 분석 응답 파싱 실패',
        };
    }
}
