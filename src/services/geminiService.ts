import { GoogleGenAI } from '@google/genai';
import type { SimulationParams, FleetVessel, Scenario } from '../types';

export const LOADING_MESSAGES = [
    '보안 해양 온톨로지에 연결 중...',
    '제미나이가 온톨로지 데이터를 분석 중입니다...',
    'WS 운임 스프레드 시뮬레이션 실행 중...',
    '테일 리스크 시나리오를 연산 중입니다...',
    '선대 리스크 프로파일 교차 검증 중...',
    '경영진 브리핑 보고서를 생성 중입니다...',
];

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
