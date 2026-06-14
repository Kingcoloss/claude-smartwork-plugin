# Graph Report - buddhist-method-main  (2026-06-14)

## Corpus Check
- Corpus is ~4,250 words - fits in a single context window. You may not need a graph.

## Summary
- 22 nodes · 29 edges · 5 communities
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]

## God Nodes (most connected - your core abstractions)
1. `Buddhist Method Skill (buddhist-method)` - 10 edges
2. `Extended Principles Reference` - 6 edges
3. `Four Noble Truths as Debugging Frame` - 5 edges
4. `Pahāna (ปหานะ) — Remove the cause, not the symptom` - 4 edges
5. `README (English) — Buddhist Method` - 3 edges
6. `Sati-Sampajañña (สติ-สัมปชัญญะ) — Mindfulness with clear comprehension` - 3 edges
7. `Apāyakosalla (อปายโกศล) — Skill in recognizing decline` - 3 edges
8. `README (Thai) — Buddhist Method` - 2 edges
9. `Four Noble Truths as Debugging Frame (ariyasacca-debug)` - 2 edges
10. `Kalāma (กาลามสูตร) — Verify, do not trust pattern` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Appamāda (อัปปมาทะ) — Heedfulness across long tasks` --semantically_similar_to--> `Sati-Sampajañña (สติ-สัมปชัญญะ) — Mindfulness with clear comprehension`  [INFERRED] [semantically similar]
  buddhist-method-main/references/extended-principles.md → buddhist-method-main/SKILL.md
- `Atthatraya — Three levels of benefit` --semantically_similar_to--> `Pahāna (ปหานะ) — Remove the cause, not the symptom`  [INFERRED] [semantically similar]
  buddhist-method-main/references/extended-principles.md → buddhist-method-main/SKILL.md
- `Buddhist Method Skill (buddhist-method)` --references--> `Four Noble Truths as Debugging Frame (ariyasacca-debug)`  [EXTRACTED]
  buddhist-method-main/SKILL.md → buddhist-method-main/references/ariyasacca-debug.md
- `Apāyakosalla (อปายโกศล) — Skill in recognizing decline` --semantically_similar_to--> `Upekkhā (อุเบกขา) — Equanimity under pressure`  [INFERRED] [semantically similar]
  buddhist-method-main/references/extended-principles.md → buddhist-method-main/SKILL.md
- `README (English) — Buddhist Method` --documents--> `Buddhist Method Skill (buddhist-method)`  [EXTRACTED]
  buddhist-method-main/README.md → buddhist-method-main/SKILL.md

## Hyperedges (group relationships)
- **Bug Debugging Principle Chain** — yoniso_principle, pahana_principle, four_noble_truths_debug_frame [EXTRACTED 1.00]
- **User Pushback Response Chain** — upekkha_principle, kalama_principle, anatta_principle [EXTRACTED 1.00]
- **Four Noble Truths Full Debug Cycle** — parinna_step, pahana_principle, sacchikiriya_step, bhavana_step [EXTRACTED 1.00]

## Communities (5 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.38
Nodes (7): Anatta (อนัตตา) — Non-attachment to your own output, Buddhist Method Skill (buddhist-method), Kalāma (กาลามสูตร) — Verify, do not trust pattern, LLM Failure Modes targeted by Buddhist Method, Pahāna (ปหานะ) — Remove the cause, not the symptom, Sati-Sampajañña (สติ-สัมปชัญญะ) — Mindfulness with clear comprehension, Yoniso Manasikāra (โยนิโสมนสิการ) — Root-cause attention

### Community 1 - "Community 1"
Cohesion: 0.4
Nodes (5): Appamāda (อัปปมาทะ) — Heedfulness across long tasks, Atthatraya — Three levels of benefit, Extended Principles Reference, Majjhimā Paṭipadā (มัชฌิมาปฏิปทา) — Middle Way for solution sizing, Sappurisadhamma (สัปปุริสธรรม) — Knowing self, time, audience

### Community 2 - "Community 2"
Cohesion: 0.5
Nodes (4): Four Noble Truths as Debugging Frame (ariyasacca-debug), Bhāvanā — Develop the practice, Four Noble Truths as Debugging Frame, Sacchikiriyā — Confirm the problem is gone

### Community 3 - "Community 3"
Cohesion: 1.0
Nodes (3): Pali Names as Mnemonic Infrastructure, README (English) — Buddhist Method, README (Thai) — Buddhist Method

### Community 4 - "Community 4"
Cohesion: 0.67
Nodes (3): Apāyakosalla (อปายโกศล) — Skill in recognizing decline, Pariññā — Fully understand the problem, Upekkhā (อุเบกขา) — Equanimity under pressure

## Knowledge Gaps
- **6 isolated node(s):** `Anatta (อนัตตา) — Non-attachment to your own output`, `Sappurisadhamma (สัปปุริสธรรม) — Knowing self, time, audience`, `Majjhimā Paṭipadā (มัชฌิมาปฏิปทา) — Middle Way for solution sizing`, `Sacchikiriyā — Confirm the problem is gone`, `Bhāvanā — Develop the practice` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Buddhist Method Skill (buddhist-method)` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`?**
  _High betweenness centrality (0.664) - this node is a cross-community bridge._
- **Why does `Extended Principles Reference` connect `Community 1` to `Community 0`, `Community 4`?**
  _High betweenness centrality (0.303) - this node is a cross-community bridge._
- **Why does `Four Noble Truths as Debugging Frame` connect `Community 2` to `Community 0`, `Community 4`?**
  _High betweenness centrality (0.228) - this node is a cross-community bridge._
- **What connects `Anatta (อนัตตา) — Non-attachment to your own output`, `Sappurisadhamma (สัปปุริสธรรม) — Knowing self, time, audience`, `Majjhimā Paṭipadā (มัชฌิมาปฏิปทา) — Middle Way for solution sizing` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._