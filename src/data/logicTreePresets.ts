/**
 * Logic Tree Presets — Pre-built causal logic trees for each BASE_SCENARIO.
 *
 * Each preset contains a set of nodes (trigger/variable → condition → action → outcome → vessel)
 * and edges that form a causal chain specific to the scenario's risk profile.
 *
 * These are registered into Firebase on first load and can be restored via the "프리셋 복원" button.
 */
import type { ProcessNode, ProcessEdge } from '../components/widgets/LogicMapCanvas';

export interface LogicTreePreset {
    scenarioId: string;
    nodes: ProcessNode[];
    edges: ProcessEdge[];
}

// ============================================================
// Helper — generate IDs namespaced to each scenario
// ============================================================
const n = (scenarioId: string, suffix: string) => `preset-${scenarioId}-${suffix}`;
const e = (scenarioId: string, suffix: string) => `preset-edge-${scenarioId}-${suffix}`;

// ============================================================
// PRESET DEFINITIONS
// ============================================================

export const LOGIC_TREE_PRESETS: LogicTreePreset[] = [
    // ─────────────────────────────────────────────────────────
    // 1. realtime — 실시간 이벤트 기반 인과관계
    // ─────────────────────────────────────────────────────────
    {
        scenarioId: 'realtime',
        nodes: [
            { id: n('rt', 'vlsfo'), x: 40, y: 40, type: 'variable', text: 'VLSFO 유가', variableId: 'vlsfoPrice' },
            { id: n('rt', 'news'), x: 40, y: 160, type: 'variable', text: '글로벌 뉴스 불안 지수', variableId: 'newsSentimentScore' },
            { id: n('rt', 'cond1'), x: 240, y: 40, type: 'condition', text: 'VLSFO > $700/mt' },
            { id: n('rt', 'cond2'), x: 240, y: 160, type: 'condition', text: '불안지수 > 60' },
            { id: n('rt', 'act1'), x: 440, y: 40, type: 'action', text: '감속 운항 전환 (-2kn)' },
            { id: n('rt', 'act2'), x: 440, y: 160, type: 'action', text: '긴급 항로 재검토' },
            { id: n('rt', 'out1'), x: 640, y: 100, type: 'outcome', text: 'TCE 변동 / OPEX 증감' },
            { id: n('rt', 'vessel1'), x: 840, y: 60, type: 'vessel', text: 'VL BREEZE', objectId: 'vessel-vl-breeze' },
            { id: n('rt', 'vessel2'), x: 840, y: 160, type: 'vessel', text: 'STAR MARIA', objectId: 'vessel-star-maria' },
        ],
        edges: [
            { id: e('rt', '1'), source: n('rt', 'vlsfo'), target: n('rt', 'cond1'), label: 'price spike' },
            { id: e('rt', '2'), source: n('rt', 'news'), target: n('rt', 'cond2'), label: 'sentiment rise' },
            { id: e('rt', '3'), source: n('rt', 'cond1'), target: n('rt', 'act1'), label: 'triggers' },
            { id: e('rt', '4'), source: n('rt', 'cond2'), target: n('rt', 'act2'), label: 'triggers' },
            { id: e('rt', '5'), source: n('rt', 'act1'), target: n('rt', 'out1'), label: 'reduces bunker' },
            { id: e('rt', '6'), source: n('rt', 'act2'), target: n('rt', 'out1'), label: 'reroute cost' },
            { id: e('rt', '7'), source: n('rt', 'out1'), target: n('rt', 'vessel1'), label: 'impacts' },
            { id: e('rt', '8'), source: n('rt', 'out1'), target: n('rt', 'vessel2'), label: 'impacts' },
        ],
    },

    // ─────────────────────────────────────────────────────────
    // 2. peaceful — 평시 경영 환경
    // ─────────────────────────────────────────────────────────
    {
        scenarioId: 'peaceful',
        nodes: [
            { id: n('peace', 'ws'), x: 40, y: 60, type: 'variable', text: 'WS 운임 지수', variableId: 'freightRateWS' },
            { id: n('peace', 'vlsfo'), x: 40, y: 180, type: 'variable', text: 'VLSFO 유가', variableId: 'vlsfoPrice' },
            { id: n('peace', 'cond1'), x: 260, y: 60, type: 'condition', text: 'WS 50~60 안정 구간' },
            { id: n('peace', 'cond2'), x: 260, y: 180, type: 'condition', text: 'VLSFO < $650/mt' },
            { id: n('peace', 'act'), x: 460, y: 120, type: 'action', text: '정상 설계속도 운항' },
            { id: n('peace', 'out'), x: 660, y: 120, type: 'outcome', text: '안정적 P&L 유지' },
            { id: n('peace', 'vessel'), x: 860, y: 120, type: 'vessel', text: 'VL BREEZE', objectId: 'vessel-vl-breeze' },
        ],
        edges: [
            { id: e('peace', '1'), source: n('peace', 'ws'), target: n('peace', 'cond1'), label: 'in range' },
            { id: e('peace', '2'), source: n('peace', 'vlsfo'), target: n('peace', 'cond2'), label: 'stable' },
            { id: e('peace', '3'), source: n('peace', 'cond1'), target: n('peace', 'act'), label: 'maintains' },
            { id: e('peace', '4'), source: n('peace', 'cond2'), target: n('peace', 'act'), label: 'supports' },
            { id: e('peace', '5'), source: n('peace', 'act'), target: n('peace', 'out'), label: 'delivers' },
            { id: e('peace', '6'), source: n('peace', 'out'), target: n('peace', 'vessel'), label: 'stable P&L' },
        ],
    },

    // ─────────────────────────────────────────────────────────
    // 3. iran-conflict — 호르무즈 위기
    // ─────────────────────────────────────────────────────────
    {
        scenarioId: 'iran-conflict',
        nodes: [
            { id: n('iran', 'trig'), x: 40, y: 100, type: 'trigger', text: '호르무즈 해협 봉쇄 위협' },
            { id: n('iran', 'hormuz'), x: 40, y: 240, type: 'variable', text: '호르무즈 해협 위험', variableId: 'hormuzRisk' },
            { id: n('iran', 'awrp'), x: 40, y: 340, type: 'variable', text: '전쟁보험료 율', variableId: 'awrpRate' },
            { id: n('iran', 'cond1'), x: 280, y: 60, type: 'condition', text: '호르무즈 위험 > 70%' },
            { id: n('iran', 'cond2'), x: 280, y: 200, type: 'condition', text: 'AWRP > 0.15%' },
            { id: n('iran', 'act1'), x: 480, y: 60, type: 'action', text: '희망봉(COGH) 전면 우회' },
            { id: n('iran', 'act2'), x: 480, y: 200, type: 'action', text: '긴급 보험 재심사' },
            { id: n('iran', 'out1'), x: 680, y: 60, type: 'outcome', text: '+3,200nm / 연료비 +$2.7M' },
            { id: n('iran', 'out2'), x: 680, y: 200, type: 'outcome', text: 'AWRP $840K/VLCC' },
            { id: n('iran', 'out3'), x: 680, y: 320, type: 'outcome', text: 'WS 운임 ↑ +200%' },
            { id: n('iran', 'vessel1'), x: 900, y: 60, type: 'vessel', text: 'VL BREEZE', objectId: 'vessel-vl-breeze' },
            { id: n('iran', 'vessel2'), x: 900, y: 200, type: 'vessel', text: 'HANA PIONEER', objectId: 'vessel-hana-pioneer' },
            { id: n('iran', 'vessel3'), x: 900, y: 320, type: 'vessel', text: 'STAR MARIA', objectId: 'vessel-star-maria' },
        ],
        edges: [
            { id: e('iran', '1'), source: n('iran', 'trig'), target: n('iran', 'cond1'), label: 'threatens' },
            { id: e('iran', '2'), source: n('iran', 'hormuz'), target: n('iran', 'cond1'), label: 'exceeds threshold' },
            { id: e('iran', '3'), source: n('iran', 'awrp'), target: n('iran', 'cond2'), label: 'premium increase' },
            { id: e('iran', '4'), source: n('iran', 'cond1'), target: n('iran', 'act1'), label: 'reroutes' },
            { id: e('iran', '5'), source: n('iran', 'cond2'), target: n('iran', 'act2'), label: 'reassess' },
            { id: e('iran', '6'), source: n('iran', 'act1'), target: n('iran', 'out1'), label: 'raises OPEX' },
            { id: e('iran', '7'), source: n('iran', 'act2'), target: n('iran', 'out2'), label: 'raises OPEX' },
            { id: e('iran', '8'), source: n('iran', 'trig'), target: n('iran', 'out3'), label: 'raises TCE' },
            { id: e('iran', '9'), source: n('iran', 'out1'), target: n('iran', 'vessel1'), label: 'impacts' },
            { id: e('iran', '10'), source: n('iran', 'out2'), target: n('iran', 'vessel2'), label: 'impacts' },
            { id: e('iran', '11'), source: n('iran', 'out3'), target: n('iran', 'vessel3'), label: 'impacts' },
        ],
    },

    // ─────────────────────────────────────────────────────────
    // 4. stagflation — 글로벌 스태그플레이션
    // ─────────────────────────────────────────────────────────
    {
        scenarioId: 'stagflation',
        nodes: [
            { id: n('stag', 'trig'), x: 40, y: 100, type: 'trigger', text: '고물가 + 저성장 동시 진행' },
            { id: n('stag', 'vlsfo'), x: 40, y: 240, type: 'variable', text: 'VLSFO 유가', variableId: 'vlsfoPrice' },
            { id: n('stag', 'rate'), x: 40, y: 340, type: 'variable', text: '글로벌 기준금리', variableId: 'interestRate' },
            { id: n('stag', 'cond1'), x: 280, y: 100, type: 'condition', text: 'VLSFO > $900/mt' },
            { id: n('stag', 'cond2'), x: 280, y: 260, type: 'condition', text: '금리 > 7%' },
            { id: n('stag', 'act1'), x: 480, y: 100, type: 'action', text: '감속 운항 (연비 절감)' },
            { id: n('stag', 'act2'), x: 480, y: 260, type: 'action', text: '선대 축소 운영 검토' },
            { id: n('stag', 'out1'), x: 680, y: 100, type: 'outcome', text: '연료비 -33% / 항해일수 ↑' },
            { id: n('stag', 'out2'), x: 680, y: 260, type: 'outcome', text: 'Net P&L 악화' },
            { id: n('stag', 'vessel'), x: 880, y: 180, type: 'vessel', text: 'VL BREEZE', objectId: 'vessel-vl-breeze' },
        ],
        edges: [
            { id: e('stag', '1'), source: n('stag', 'trig'), target: n('stag', 'cond1'), label: 'price surge' },
            { id: e('stag', '2'), source: n('stag', 'vlsfo'), target: n('stag', 'cond1'), label: 'exceeds' },
            { id: e('stag', '3'), source: n('stag', 'rate'), target: n('stag', 'cond2'), label: 'tightening' },
            { id: e('stag', '4'), source: n('stag', 'cond1'), target: n('stag', 'act1'), label: 'slow steaming' },
            { id: e('stag', '5'), source: n('stag', 'cond2'), target: n('stag', 'act2'), label: 'cost cutting' },
            { id: e('stag', '6'), source: n('stag', 'act1'), target: n('stag', 'out1'), label: 'reduces bunker' },
            { id: e('stag', '7'), source: n('stag', 'act2'), target: n('stag', 'out2'), label: 'revenue loss' },
            { id: e('stag', '8'), source: n('stag', 'out1'), target: n('stag', 'vessel'), label: 'impacts' },
            { id: e('stag', '9'), source: n('stag', 'out2'), target: n('stag', 'vessel'), label: 'impacts' },
        ],
    },

    // ─────────────────────────────────────────────────────────
    // 5. pandemic-resurgence — 글로벌 팬데믹 재발
    // ─────────────────────────────────────────────────────────
    {
        scenarioId: 'pandemic-resurgence',
        nodes: [
            { id: n('pan', 'trig'), x: 40, y: 100, type: 'trigger', text: '신종 변이 바이러스 발생' },
            { id: n('pan', 'pandemic'), x: 40, y: 240, type: 'variable', text: '팬데믹 리스크', variableId: 'pandemicRisk' },
            { id: n('pan', 'supply'), x: 40, y: 340, type: 'variable', text: '공급망 스트레스', variableId: 'supplyChainStress' },
            { id: n('pan', 'cond1'), x: 280, y: 100, type: 'condition', text: '팬데믹 지수 > 80' },
            { id: n('pan', 'cond2'), x: 280, y: 280, type: 'condition', text: '공급망 스트레스 > 90' },
            { id: n('pan', 'act1'), x: 480, y: 100, type: 'action', text: '선원 교대 중지 / 격리' },
            { id: n('pan', 'act2'), x: 480, y: 280, type: 'action', text: '항만 운영 축소' },
            { id: n('pan', 'out1'), x: 680, y: 100, type: 'outcome', text: '지연 +14일 / 선원 피로' },
            { id: n('pan', 'out2'), x: 680, y: 280, type: 'outcome', text: '체선 대기 +7일' },
            { id: n('pan', 'vessel1'), x: 900, y: 100, type: 'vessel', text: 'VL BREEZE', objectId: 'vessel-vl-breeze' },
            { id: n('pan', 'vessel2'), x: 900, y: 280, type: 'vessel', text: 'STAR MARIA', objectId: 'vessel-star-maria' },
        ],
        edges: [
            { id: e('pan', '1'), source: n('pan', 'trig'), target: n('pan', 'cond1'), label: 'outbreak' },
            { id: e('pan', '2'), source: n('pan', 'pandemic'), target: n('pan', 'cond1'), label: 'exceeds' },
            { id: e('pan', '3'), source: n('pan', 'supply'), target: n('pan', 'cond2'), label: 'disruption' },
            { id: e('pan', '4'), source: n('pan', 'cond1'), target: n('pan', 'act1'), label: 'lockdown' },
            { id: e('pan', '5'), source: n('pan', 'cond2'), target: n('pan', 'act2'), label: 'port closure' },
            { id: e('pan', '6'), source: n('pan', 'act1'), target: n('pan', 'out1'), label: 'delays' },
            { id: e('pan', '7'), source: n('pan', 'act2'), target: n('pan', 'out2'), label: 'congestion' },
            { id: e('pan', '8'), source: n('pan', 'out1'), target: n('pan', 'vessel1'), label: 'impacts' },
            { id: e('pan', '9'), source: n('pan', 'out2'), target: n('pan', 'vessel2'), label: 'impacts' },
        ],
    },

    // ─────────────────────────────────────────────────────────
    // 6. natural-disaster — 대규모 천재지변
    // ─────────────────────────────────────────────────────────
    {
        scenarioId: 'natural-disaster',
        nodes: [
            { id: n('nat', 'trig'), x: 40, y: 100, type: 'trigger', text: '아태 대규모 지진/쓰나미' },
            { id: n('nat', 'disaster'), x: 40, y: 250, type: 'variable', text: '천재지변 지수', variableId: 'naturalDisasterIndex' },
            { id: n('nat', 'awrp'), x: 40, y: 350, type: 'variable', text: '전쟁보험료 율', variableId: 'awrpRate' },
            { id: n('nat', 'cond1'), x: 280, y: 100, type: 'condition', text: '천재지변 지수 > 80' },
            { id: n('nat', 'cond2'), x: 280, y: 280, type: 'condition', text: '보험료율 급등' },
            { id: n('nat', 'act1'), x: 480, y: 100, type: 'action', text: '항만 폐쇄 / 대체항로' },
            { id: n('nat', 'act2'), x: 480, y: 280, type: 'action', text: '화물 보험 재산정' },
            { id: n('nat', 'out1'), x: 680, y: 100, type: 'outcome', text: '운항 지연 +10일' },
            { id: n('nat', 'out2'), x: 680, y: 280, type: 'outcome', text: 'OPEX +$1.5M' },
            { id: n('nat', 'vessel'), x: 880, y: 190, type: 'vessel', text: 'HANA PIONEER', objectId: 'vessel-hana-pioneer' },
        ],
        edges: [
            { id: e('nat', '1'), source: n('nat', 'trig'), target: n('nat', 'cond1'), label: 'earthquake' },
            { id: e('nat', '2'), source: n('nat', 'disaster'), target: n('nat', 'cond1'), label: 'exceeds' },
            { id: e('nat', '3'), source: n('nat', 'awrp'), target: n('nat', 'cond2'), label: 'premium spike' },
            { id: e('nat', '4'), source: n('nat', 'cond1'), target: n('nat', 'act1'), label: 'port shutdown' },
            { id: e('nat', '5'), source: n('nat', 'cond2'), target: n('nat', 'act2'), label: 'reassess' },
            { id: e('nat', '6'), source: n('nat', 'act1'), target: n('nat', 'out1'), label: 'delays' },
            { id: e('nat', '7'), source: n('nat', 'act2'), target: n('nat', 'out2'), label: 'raises OPEX' },
            { id: e('nat', '8'), source: n('nat', 'out1'), target: n('nat', 'vessel'), label: 'impacts' },
            { id: e('nat', '9'), source: n('nat', 'out2'), target: n('nat', 'vessel'), label: 'impacts' },
        ],
    },

    // ─────────────────────────────────────────────────────────
    // 7. trade-war — 미중 무역전쟁
    // ─────────────────────────────────────────────────────────
    {
        scenarioId: 'trade-war',
        nodes: [
            { id: n('tw', 'trig'), x: 40, y: 100, type: 'trigger', text: '관세 300% 부과 발표' },
            { id: n('tw', 'trade'), x: 40, y: 250, type: 'variable', text: '무역전쟁 강도', variableId: 'tradeWarIntensity' },
            { id: n('tw', 'supply'), x: 40, y: 350, type: 'variable', text: '공급망 스트레스', variableId: 'supplyChainStress' },
            { id: n('tw', 'cond1'), x: 280, y: 100, type: 'condition', text: '무역전쟁 강도 > 80' },
            { id: n('tw', 'cond2'), x: 280, y: 280, type: 'condition', text: '물동량 30% 급감' },
            { id: n('tw', 'act1'), x: 480, y: 100, type: 'action', text: '항로 변경 / 화물 재배정' },
            { id: n('tw', 'act2'), x: 480, y: 280, type: 'action', text: '벌크선 감속/정박' },
            { id: n('tw', 'out1'), x: 680, y: 100, type: 'outcome', text: 'BDI 폭락 → TCE ↓' },
            { id: n('tw', 'out2'), x: 680, y: 280, type: 'outcome', text: '공선율 증가 → 손실' },
            { id: n('tw', 'vessel1'), x: 900, y: 100, type: 'vessel', text: 'STAR MARIA', objectId: 'vessel-star-maria' },
            { id: n('tw', 'vessel2'), x: 900, y: 280, type: 'vessel', text: 'VL BREEZE', objectId: 'vessel-vl-breeze' },
        ],
        edges: [
            { id: e('tw', '1'), source: n('tw', 'trig'), target: n('tw', 'cond1'), label: 'escalation' },
            { id: e('tw', '2'), source: n('tw', 'trade'), target: n('tw', 'cond1'), label: 'exceeds' },
            { id: e('tw', '3'), source: n('tw', 'supply'), target: n('tw', 'cond2'), label: 'disruption' },
            { id: e('tw', '4'), source: n('tw', 'cond1'), target: n('tw', 'act1'), label: 'reroutes' },
            { id: e('tw', '5'), source: n('tw', 'cond2'), target: n('tw', 'act2'), label: 'lay-up' },
            { id: e('tw', '6'), source: n('tw', 'act1'), target: n('tw', 'out1'), label: 'BDI crash' },
            { id: e('tw', '7'), source: n('tw', 'act2'), target: n('tw', 'out2'), label: 'revenue loss' },
            { id: e('tw', '8'), source: n('tw', 'out1'), target: n('tw', 'vessel1'), label: 'impacts' },
            { id: e('tw', '9'), source: n('tw', 'out2'), target: n('tw', 'vessel2'), label: 'impacts' },
        ],
    },

    // ─────────────────────────────────────────────────────────
    // 8. cyber-attack — 글로벌 사이버 공격
    // ─────────────────────────────────────────────────────────
    {
        scenarioId: 'cyber-attack',
        nodes: [
            { id: n('cyber', 'trig'), x: 40, y: 100, type: 'trigger', text: '국가급 사이버 공격 감지' },
            { id: n('cyber', 'threat'), x: 40, y: 250, type: 'variable', text: '사이버 위협 수준', variableId: 'cyberThreatLevel' },
            { id: n('cyber', 'gps'), x: 40, y: 350, type: 'variable', text: 'GPS 교란', variableId: 'gpsJamming' },
            { id: n('cyber', 'cond1'), x: 280, y: 100, type: 'condition', text: '사이버 위협 > 90' },
            { id: n('cyber', 'cond2'), x: 280, y: 300, type: 'condition', text: 'GPS/AIS 마비' },
            { id: n('cyber', 'act1'), x: 480, y: 100, type: 'action', text: '항만 IT 시스템 비상전환' },
            { id: n('cyber', 'act2'), x: 480, y: 300, type: 'action', text: '수동 항법 / 입항 대기' },
            { id: n('cyber', 'out1'), x: 680, y: 100, type: 'outcome', text: '물류 처리 -50%' },
            { id: n('cyber', 'out2'), x: 680, y: 300, type: 'outcome', text: '지연 +5일 / 보험↑' },
            { id: n('cyber', 'vessel1'), x: 900, y: 100, type: 'vessel', text: 'HANA PIONEER', objectId: 'vessel-hana-pioneer' },
            { id: n('cyber', 'vessel2'), x: 900, y: 300, type: 'vessel', text: 'VL BREEZE', objectId: 'vessel-vl-breeze' },
        ],
        edges: [
            { id: e('cyber', '1'), source: n('cyber', 'trig'), target: n('cyber', 'cond1'), label: 'attack detected' },
            { id: e('cyber', '2'), source: n('cyber', 'threat'), target: n('cyber', 'cond1'), label: 'exceeds' },
            { id: e('cyber', '3'), source: n('cyber', 'gps'), target: n('cyber', 'cond2'), label: 'jamming' },
            { id: e('cyber', '4'), source: n('cyber', 'cond1'), target: n('cyber', 'act1'), label: 'emergency' },
            { id: e('cyber', '5'), source: n('cyber', 'cond2'), target: n('cyber', 'act2'), label: 'fallback' },
            { id: e('cyber', '6'), source: n('cyber', 'act1'), target: n('cyber', 'out1'), label: 'throughput drop' },
            { id: e('cyber', '7'), source: n('cyber', 'act2'), target: n('cyber', 'out2'), label: 'delays' },
            { id: e('cyber', '8'), source: n('cyber', 'out1'), target: n('cyber', 'vessel1'), label: 'impacts' },
            { id: e('cyber', '9'), source: n('cyber', 'out2'), target: n('cyber', 'vessel2'), label: 'impacts' },
        ],
    },

    // ─────────────────────────────────────────────────────────
    // 9. energy-crisis — 글로벌 에너지 위기
    // ─────────────────────────────────────────────────────────
    {
        scenarioId: 'energy-crisis',
        nodes: [
            { id: n('energy', 'trig'), x: 40, y: 100, type: 'trigger', text: 'OPEC 급감산 + 중동 직접 충돌' },
            { id: n('energy', 'vlsfo'), x: 40, y: 250, type: 'variable', text: 'VLSFO 유가', variableId: 'vlsfoPrice' },
            { id: n('energy', 'crisis'), x: 40, y: 350, type: 'variable', text: '에너지 위기 수준', variableId: 'energyCrisisLevel' },
            { id: n('energy', 'cond1'), x: 280, y: 100, type: 'condition', text: 'VLSFO > $1,200/mt' },
            { id: n('energy', 'cond2'), x: 280, y: 300, type: 'condition', text: '에너지 위기 > 90' },
            { id: n('energy', 'act1'), x: 480, y: 100, type: 'action', text: '초감속 운항 (-4kn)' },
            { id: n('energy', 'act2'), x: 480, y: 300, type: 'action', text: '비경제 항차 운항 중단' },
            { id: n('energy', 'out1'), x: 680, y: 100, type: 'outcome', text: '연료비 -45% / 항해 +8일' },
            { id: n('energy', 'out2'), x: 680, y: 300, type: 'outcome', text: '선대 가동률 60%↓' },
            { id: n('energy', 'vessel1'), x: 900, y: 100, type: 'vessel', text: 'VL BREEZE', objectId: 'vessel-vl-breeze' },
            { id: n('energy', 'vessel2'), x: 900, y: 200, type: 'vessel', text: 'STAR MARIA', objectId: 'vessel-star-maria' },
            { id: n('energy', 'vessel3'), x: 900, y: 300, type: 'vessel', text: 'HANA PIONEER', objectId: 'vessel-hana-pioneer' },
        ],
        edges: [
            { id: e('energy', '1'), source: n('energy', 'trig'), target: n('energy', 'cond1'), label: 'oil shortage' },
            { id: e('energy', '2'), source: n('energy', 'vlsfo'), target: n('energy', 'cond1'), label: 'price spike' },
            { id: e('energy', '3'), source: n('energy', 'crisis'), target: n('energy', 'cond2'), label: 'critical' },
            { id: e('energy', '4'), source: n('energy', 'cond1'), target: n('energy', 'act1'), label: 'ultra slow' },
            { id: e('energy', '5'), source: n('energy', 'cond2'), target: n('energy', 'act2'), label: 'suspend' },
            { id: e('energy', '6'), source: n('energy', 'act1'), target: n('energy', 'out1'), label: 'reduces bunker' },
            { id: e('energy', '7'), source: n('energy', 'act2'), target: n('energy', 'out2'), label: 'fleet cut' },
            { id: e('energy', '8'), source: n('energy', 'out1'), target: n('energy', 'vessel1'), label: 'impacts' },
            { id: e('energy', '9'), source: n('energy', 'out1'), target: n('energy', 'vessel2'), label: 'impacts' },
            { id: e('energy', '10'), source: n('energy', 'out2'), target: n('energy', 'vessel3'), label: 'impacts' },
        ],
    },
];

/**
 * Lookup helper — find preset by scenario ID.
 */
export function getPresetForScenario(scenarioId: string): LogicTreePreset | undefined {
    return LOGIC_TREE_PRESETS.find(p => p.scenarioId === scenarioId);
}
