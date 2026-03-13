import { GoogleGenAI } from '@google/genai';
import type { SimulationParams, FleetVessel, Scenario, OntologyObject, OntologyLink, QuantMetrics, AIPExecutiveBriefing } from '../types';

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
이 보고서는 해운 업계 최고경영진에게 직접 공유되므로, 전문적이고 체계적인 포맷으로 작성해야 한다.

### 보고서 구조 (반드시 이 순서를 따를 것):

## 📊 Executive Summary
- 현재 시나리오의 핵심 위험 요약 (1-2문단)
- 핵심 수치 3-5개를 별도 표로 정리 (마크다운 테이블)

## 🔴 전사적 최대 리스크 지점
- 온톨로지 그래프 분석 기반 최대 위험 노드와 전파 경로를 식별
- 각 리스크에 대해 리스크 점수, 영향 범위, 전파 경로를 구체적 수치로 제시
- 최소 5개 이상의 리스크 포인트를 분석
- **리스크 전파 경로**: 노드 A → 노드 B → 노드 C 형태로 전파 체인을 명시

## 🔗 온톨로지 리스크 전파 분석
- 고위험 객체 간 연결관계를 기반으로 리스크가 어떻게 전파되는지 분석
- 각 전파 경로의 가중치(weight)와 영향도를 수치로 제시
- 요약 표를 포함하여 한눈에 파악 가능하게 할 것

## 💰 재무적 타격 예상치
- 시나리오별 추가 비용 (연료, 보험, 우회 항로, 체선료 등)
- 매출 영향, 자산 가치 변동, 환율 리스크
- **반드시** 수치를 표 형식으로 정리 (마크다운 테이블 사용, 항목 | 예상 비용 | 영향 범위 컬럼으로)

## ⚡ 즉각 실행 추천 Action Plan
- 우선순위별 즉시 실행 항목 (48시간 이내)
- 중기 대응 전략 (1-4주)
- 장기 리스크 헤지 전략
- 각 항목에 대해 담당 부서 및 기대 효과를 명시

### 출력 규칙:
1. 한국어로 작성
2. 마크다운 형식 사용 (##, ###, -, **, 테이블 등)
3. 제공된 컨텍스트의 실제 수치와 객체 이름을 반드시 사용 (절대 임의 수치 사용 금지)
4. **매우 중요**: 보고서 본문에서 온톨로지 객체(선박명, 항구명, 이벤트명, 원자재명 등)를 언급할 때는 반드시 [[객체제목]] 형식으로 감싸라. 
   예시: [[Oceanic Titan]], [[호르무즈 해협 위기]], [[VLSFO]], [[Fujairah]], [[보험료 폭등]]
   이 마킹은 시스템에서 데이터 리니지(Data Lineage) 뱃지로 변환된다.
5. 각 섹션에 이모지를 활용하여 시각적 구분
6. 구체적이고 실행 가능한 권고사항 제시
7. **중요**: 각 주요 섹션 말미에 핵심 수치를 마크다운 테이블로 요약 정리할 것 — 데이터 기반 의사결정을 위해 필수
8. 분량: 충분히 상세하되, 각 섹션 내 불릿 포인트는 핵심만 간결하게 서술

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
8. **레이아웃 중요**: 각 슬라이드에 핵심 포인트를 최대 5-7개로 압축하라. 여백을 충분히 확보하여 가독성을 극대화할 것. 슬라이드가 빽빽하면 안 된다.
9. **데이터 시각화**: 핵심 KPI 수치는 이모지(📊📈🔴🟡🟢)와 함께 별도의 \"수치 블록\"으로 표현하라. 예: \"📊 VLSFO: $680/MT (+12.3%) | 📈 운임 변동성: EXTREME\"
10. **표지 슬라이드**: 첫 슬라이드는 제목, 날짜, 위험 등급만 간결하게 표시. 내용은 2번째 슬라이드부터.
11. **요약 표**: 시나리오 비교 또는 재무 영향 분석 시 반드시 마크다운 테이블을 사용하여 한눈에 비교 가능하게 할 것

### 슬라이드 구조:
- 슬라이드 1: 긴급 브리핑 표지 (시나리오 명, 일시, 위험 등급 — 간결하게)
- 슬라이드 2: 핵심 KPI 대시보드 (주요 수치 3-5개를 큰 글씨로, 테이블 형태)
- 슬라이드 3: 시장 취약성 요약 (뉴스 불안 지수, VLSFO 가격, 운임 변동성)
- 슬라이드 4: 고위험 선대 현황 (Critical/High 리스크 선박 — 테이블 사용)
- 슬라이드 5-9: 테일 리스크 시나리오 분석 (각 시나리오별 확률, 영향, 대응)
  - 시나리오 예시: 호르무즈 해협 전면 봉쇄, 보험료 폭등, 연료 공급 차질, 용선 계약 위반, 우회 항로 비용 증가 등
- 슬라이드 10: 재무적 영향 분석 (테이블로 비용 항목 비교)
- 슬라이드 11: 긴급 권고사항 및 액션 플랜 (우선순위별 구분)
- 슬라이드 12: 결론 및 차기 브리핑 일정

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


// ============================================================
// MODULE 3: AIP EXECUTIVE BRIEFING — Quant Strategist Engine
// Generates structured JSON with hedging strategies, VaR, and
// operational directives. Temperature 0.2 for cold analysis.
// ============================================================

export const EXECUTIVE_BRIEFING_LOADING_MESSAGES = [
    '퀀트 전략가 AI 초기화 중...',
    '온톨로지 + LSEG 퀀트 데이터 결합 분석 중...',
    '선대 VaR 노출도 계산 중...',
    '파생상품 헤지 비율 최적화 중...',
    '운영 지시사항 도출 중...',
    '경영진 브리핑 JSON 생성 중...',
];

export async function generateAIPExecutiveBriefing(
    apiKey: string,
    ontologyState: {
        objects: OntologyObject[];
        links: OntologyLink[];
        quantMetrics: Record<string, QuantMetrics>;
    },
    scenarioParams: SimulationParams,
    fleetData?: FleetVessel[],
): Promise<AIPExecutiveBriefing> {
    const ai = new GoogleGenAI({ apiKey });

    // Build compact context for the AI
    const highRiskObjects = ontologyState.objects.filter(
        o => (o.properties.riskScore as number) >= 40 && o.metadata.status === 'active'
    );

    const vessels = ontologyState.objects.filter(o => o.type === 'Vessel');
    const vesselSummaries = vessels.slice(0, 15).map(v => ({
        name: v.title,
        riskScore: v.properties.riskScore,
        bunkerCostRisk: v.properties.bunkerCostRisk || 'Unknown',
        estimatedMargin: v.properties.estimatedMargin || 'N/A',
        planDays: v.properties.planDays,
        sailedDays: v.properties.sailedDays,
    }));

    const quantSummary = Object.entries(ontologyState.quantMetrics).map(([ric, m]) => ({
        ric,
        sma20: m.sma20,
        volatility30d: m.volatility30d,
        zScore: m.zScore,
        riskAlert: m.riskAlert,
        momentum: m.momentum,
    }));

    const riskAlerts = quantSummary.filter(q => q.riskAlert);

    const context = {
        analysisType: 'EXECUTIVE_QUANT_BRIEFING',
        timestamp: new Date().toISOString(),
        scenarioParameters: {
            vlsfoPrice: scenarioParams.vlsfoPrice,
            newsSentimentScore: scenarioParams.newsSentimentScore,
            awrpRate: scenarioParams.awrpRate,
            interestRate: scenarioParams.interestRate,
            supplyChainStress: scenarioParams.supplyChainStress,
            cyberThreatLevel: scenarioParams.cyberThreatLevel,
        },
        quantMetrics: quantSummary,
        activeRiskAlerts: riskAlerts,
        fleetSummary: {
            totalVessels: vessels.length,
            vesselDetails: vesselSummaries,
        },
        highRiskNodes: highRiskObjects.slice(0, 20).map(o => ({
            id: o.id, type: o.type, title: o.title,
            riskScore: o.properties.riskScore,
            keyProps: Object.fromEntries(
                Object.entries(o.properties).filter(([k]) => !['riskScore'].includes(k)).slice(0, 5)
            ),
        })),
        ontologyStats: {
            totalObjects: ontologyState.objects.length,
            totalLinks: ontologyState.links.length,
        },
        // Part 3: Derived risk fleet data for quant fusion context
        highRiskFleet: (fleetData || []).filter(
            v => v.derivedRiskLevel === 'CRITICAL' || v.derivedRiskLevel === 'WARNING'
        ).slice(0, 15).map(v => ({
            vessel: v.vessel_name,
            type: v.vessel_type,
            location: v.location,
            derivedRiskLevel: v.derivedRiskLevel,
            riskFactors: v.riskFactors || [],
            fuelROB: v.consumption_and_rob.fo_rob,
            voyageDays: `${v.voyage_info.sailed_days}/${v.voyage_info.plan_days}`,
            route: `${v.voyage_info.departure_port} → ${v.voyage_info.destination_port}`,
        })),
        fleetRiskDistribution: {
            totalVessels: (fleetData || []).length,
            critical: (fleetData || []).filter(v => v.derivedRiskLevel === 'CRITICAL').length,
            warning: (fleetData || []).filter(v => v.derivedRiskLevel === 'WARNING').length,
            safe: (fleetData || []).filter(v => v.derivedRiskLevel === 'SAFE' || !v.derivedRiskLevel).length,
        },
    };

    const systemPrompt = `너는 글로벌 최고 해운사의 수석 퀀트 전략가 겸 리스크 관리 책임자(CRO)다.
제공된 온톨로지 파생 리스크 데이터, LSEG 퀀트 지표(Z-Score, 변동성, SMA), 선대 파생 리스크(derivedRiskLevel, riskFactors),
그리고 시나리오 파라미터를 분석하여 임원진에게 즉각적인 조치사항을 보고하라.

## 엄격한 원칙:
- 감정적 서론 없이 냉철하고 구체적인 수치(달러, 퍼센트)로 답변
- 제공된 데이터의 실제 수치를 근거로 분석. 임의 수치 사용 절대 금지
- 모든 텍스트는 한국어, 금융 전문 용어는 영문 병기
- highRiskFleet에 있는 선박명과 riskFactors를 정확히 참조하여 운영 지시사항을 도출

## 응답 규칙:
1. 반드시 순수 JSON으로만 응답하라. 마크다운 코드블럭(\`\`\`)을 절대 사용하지 말라.
2. 헤지 전략에는 구체적인 파생상품명, 비율(%), 예상 방어 금액을 포함
3. VaR은 시나리오별 구체적 금액(USD)으로 산출. 95% 신뢰구간 명시
4. operationalDirectives에는 반드시 highRiskFleet의 선박명을 타겟으로 지정

## JSON 스키마:
{
  "marketOutlook": {
    "summary": "퀀트 수치 기반 위기 상황 요약 (3-5문장, 핵심 Z-Score와 트렌드 언급)",
    "keyMetrics": [
      { "label": "지표명", "value": "수치와 단위", "trend": "up|down|stable|critical" }
    ]
  },
  "financialImpactVaR": {
    "totalVaR": "선대 전체 예상 최대 손실액 (95% 신뢰구간, USD)",
    "breakdown": [
      { "item": "비용 항목", "amount": "금액 (USD)", "probability": "발생 확률" }
    ],
    "assessment": "재무적 리스크 종합 평가 (2-3문장)"
  },
  "hedgingStrategies": [
    {
      "strategy": "전략명",
      "instrument": "구체적 파생상품명 (예: Baltic Capesize 5TC FFA Q2 2026)",
      "ratio": "선대 노출의 XX%",
      "rationale": "Z-Score/트렌드 기반 근거"
    }
  ],
  "operationalDirectives": [
    {
      "priority": "IMMEDIATE|SHORT_TERM|MEDIUM_TERM",
      "directive": "구체적 운영 지시 (선박명 포함)",
      "responsible": "담당 부서/직책",
      "impact": "기대 효과 (금액 또는 리스크 감소 수치)"
    }
  ],
  "generatedAt": "ISO timestamp"
}

분석할 데이터:`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            config: {
                temperature: 0.2,
            },
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `${systemPrompt}\n\n${JSON.stringify(context, null, 2)}` }],
                },
            ],
        });

        const text = response.text || '';

        // Robust JSON extraction — handle code fences, BOM, stray whitespace
        let jsonStr = text.trim();
        // Strip markdown code fences (```json ... ``` or ``` ... ```)
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        // Remove BOM if present
        jsonStr = jsonStr.replace(/^\uFEFF/, '');
        // Find first '{' and last '}' to extract JSON object
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
        }

        let parsed: any;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (parseErr) {
            console.error('[GeminiService] JSON parse failed. Raw text:', text.slice(0, 500));
            throw new Error(`AI 응답 JSON 파싱 실패: ${parseErr instanceof Error ? parseErr.message : 'Invalid JSON'}`);
        }

        // Type-safe mapping with defaults
        const briefing: AIPExecutiveBriefing = {
            marketOutlook: {
                summary: parsed.marketOutlook?.summary || '시장 분석 데이터 부족',
                keyMetrics: Array.isArray(parsed.marketOutlook?.keyMetrics)
                    ? parsed.marketOutlook.keyMetrics.map((m: any) => ({
                        label: String(m.label || ''),
                        value: String(m.value || ''),
                        trend: (['up', 'down', 'stable', 'critical'].includes(m.trend) ? m.trend : 'stable') as 'up' | 'down' | 'stable' | 'critical',
                    }))
                    : [],
            },
            financialImpactVaR: {
                totalVaR: parsed.financialImpactVaR?.totalVaR || 'N/A',
                breakdown: Array.isArray(parsed.financialImpactVaR?.breakdown)
                    ? parsed.financialImpactVaR.breakdown.map((b: any) => ({
                        item: String(b.item || ''),
                        amount: String(b.amount || ''),
                        probability: String(b.probability || ''),
                    }))
                    : [],
                assessment: parsed.financialImpactVaR?.assessment || '',
            },
            hedgingStrategies: Array.isArray(parsed.hedgingStrategies)
                ? parsed.hedgingStrategies.map((h: any) => ({
                    strategy: String(h.strategy || ''),
                    instrument: String(h.instrument || ''),
                    ratio: String(h.ratio || ''),
                    rationale: String(h.rationale || ''),
                }))
                : [],
            operationalDirectives: Array.isArray(parsed.operationalDirectives)
                ? parsed.operationalDirectives.map((d: any) => ({
                    priority: (['IMMEDIATE', 'SHORT_TERM', 'MEDIUM_TERM'].includes(d.priority) ? d.priority : 'SHORT_TERM') as 'IMMEDIATE' | 'SHORT_TERM' | 'MEDIUM_TERM',
                    directive: String(d.directive || ''),
                    responsible: String(d.responsible || ''),
                    impact: String(d.impact || ''),
                }))
                : [],
            generatedAt: parsed.generatedAt || new Date().toISOString(),
        };

        return briefing;
    } catch (err) {
        console.error('[GeminiService] Executive briefing generation failed:', err);
        throw new Error(`Executive briefing 생성 실패: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
}
