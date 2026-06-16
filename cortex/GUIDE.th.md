# คู่มือการใช้งาน cortex (ภาษาไทย)

> **cortex** คือปลั๊กอินที่ให้ Claude Code มี "สมอง" แบบมนุษย์ — **ความจำระยะยาว + กระบวนการคิด**
> และช่วย **ประหยัด token** โดยยกงานเบื้องหลังไปให้โมเดลเล็ก (ollama) ทำแทน
>
> หลักการสำคัญ: **เสริม ไม่แทนที่** (cooperate, not replace) — cortex ทำงานทับบนความสามารถเดิมของ
> Claude Code และถอยให้เสมอ ถ้าปิด cortex หรือไม่มี Bun/ollama ทุกอย่างกลับไปเป็น Claude Code ปกติ
> ไม่มีอะไรพัง · และ cortex เป็น **domain-agnostic** — ใช้ได้กับงานทุกแบบ (เขียน วิจัย วางแผน เทรด โค้ด)
> ไม่ใช่เครื่องมือสำหรับงานเขียนโปรแกรมโดยเฉพาะ

---

## 1. ติดตั้ง

### สิ่งที่ต้องมี

| สิ่งที่ต้องมี | จำเป็นไหม | หมายเหตุ |
|---|---|---|
| **[Bun](https://bun.sh) ≥ 1.2** | **จำเป็น** | รันไทม์ของปลั๊กอิน ติดตั้ง: `curl -fsSL https://bun.sh/install \| bash` · ถ้าไม่มี Bun → cortex no-op เงียบๆ ไม่กระทบ Claude Code |
| **[ollama](https://ollama.com)** | ไม่จำเป็น | สำหรับ embeddings / บีบอัด / สรุปความจำ ถ้าไม่มี → ความจำยังใช้ได้แบบค้นด้วยคีย์เวิร์ด (FTS) ส่วนการบีบอัดจะ no-op |
| **homebrew sqlite** | ไม่จำเป็น | เปิดการค้นแบบ vector (vec0) ถ้าไม่มี → ใช้ FTS อย่างเดียว `brew install sqlite` |

### ขั้นตอน

```bash
# 1. เพิ่ม marketplace (แทน <owner>/<repo> ด้วย GitHub repo จริง)
/plugin marketplace add <owner>/claude-smartwork-plugin

# 2. ติดตั้งปลั๊กอิน
/plugin install cortex@claude-smartwork
```

ตรวจว่าโหลดถูกต้อง (ไม่ต้องเรียกโมเดล — CC จะ parse ปลั๊กอินแล้วโชว์ส่วนประกอบ):

```bash
claude --plugin-dir /path/to/cortex plugin details cortex
# คาดหวัง: cortex 0.1.0 · Skills (4) · Hooks (5) · MCP (1) cortex-memory
```

### ตั้งค่า ollama (ถ้าใช้)

cortex ตั้งค่าเริ่มต้นใช้ embed model `nomic-embed-text` — ดึงมาก่อนใช้:

```bash
ollama pull nomic-embed-text      # โมเดล embedding (ค่าเริ่มต้น)
ollama pull qwen2.5:3b            # โมเดลบีบอัด (ค่าเริ่มต้น)
```

ถ้าใช้ embed model อื่นที่ดึงไว้แล้ว ตั้งผ่าน env: `CORTEX_EMBED_MODEL=<ชื่อโมเดล>`

---

## 2. ห้าระบบของสมอง (ทำงานอัตโนมัติ)

ทั้งห้าทำงานเองผ่าน lifecycle hooks — ไม่ต้องสั่ง:

| ระบบ | ทำอะไร | ทำงานตอนไหน |
|---|---|---|
| 👁 **Perception** | บีบอัดผลลัพธ์ tool ที่ยาวๆ ก่อนเข้า context | หลังเรียก Bash/Read/Grep |
| 🗣 **Expression** | ทำให้คำตอบกระชับ (ไทย/อังกฤษ ตรวจภาษาอัตโนมัติ) | เริ่ม session + ทุก prompt |
| 🧠 **Memory** | จำบทเรียน + ความรู้ข้ามเซสชัน (Episodic · LLM-Wiki · Core Memory อริยสัจ4) | ดึงทุก prompt · สรุปเก็บตอนจบ session |
| 🧭 **Cognition** | ฉีดวินัยการคิด (8 ข้อ) + เฝ้าสติ (นิวรณ์5) + เตือนถ้าวนแก้ปัญหาเดิม | เริ่ม session + ทุก prompt |
| 🌙 **Subconscious** | ollama ทำ embeddings/บีบอัด/สรุป (ยกระดับเป็น Claude ได้ถ้าเปิด) | เบื้องหลัง |

> **Cognition กับงานโค้ด:** วินัยการคิด 8 ข้อเป็น *domain-agnostic* (ใช้ทุกงาน) ส่วนวินัยเฉพาะการเขียนโค้ด
> (karpathy) และการแนะให้ใช้ graphify จะ **ฉีดเฉพาะเมื่อตรวจพบว่าเป็นงานโค้ดเท่านั้น** — งานเขียน/วิจัย/เทรด
> จะไม่โดน

---

## 3. คำสั่ง (Command Reference)

cortex ทำงานเองเป็นส่วนใหญ่ คำสั่งเหล่านี้คือส่วน **เรียกใช้เอง** เมื่ออยากสั่งตรงๆ

### `/cortex` — ควบคุมโหมดกระชับ + ดูสถานะ

| คำสั่ง | ผล |
|---|---|
| `/cortex off` | หยุดทำให้คำตอบกระชับ |
| `/cortex lite` | กระชับน้อย (ตัดคำฟุ่มเฟือย คงไวยากรณ์) |
| `/cortex full` | กระชับมาก (ค่าเริ่มต้น) |
| `/cortex ultra` | กระชับสุด (ย่อคำ ใช้ลูกศรเหตุผล) |
| `/cortex on` | กลับไปใช้ค่าที่ตั้งไว้ |
| `/cortex status` | ดูโหมดปัจจุบัน + token ที่ประหยัดสะสม |

การเปลี่ยนมีผลตั้งแต่ prompt ถัดไป

### `/cortex-recall` — ค้นความจำ

```bash
# ค้นหัวข้อ / "เคยเจอเรื่องนี้ไหม"
/cortex-recall "deadlock ที่ connection pool"

# ดูคลังความรู้ทั้งหมด (LLM-Wiki)
/cortex-recall --index
```

ผลลัพธ์มี **คำเตือนความสด** (อาจล้าสมัย — ตรวจกับสภาพปัจจุบันก่อนเชื่อ) และ `seen ×N` บอกว่าปัญหานั้นเกิดซ้ำกี่ครั้ง

### `/cortex-remember` — บันทึกความจำตั้งใจ

```bash
# บันทึกบทเรียน (Core Memory / อริยสัจ4) — มีแค่ --lesson ก็พอ
/cortex-remember --lesson "<ปัญหา>" --cause "<สาเหตุราก>" --fix "<วิธีแก้>"

# บันทึกหน้าความรู้ (LLM-Wiki) — ต้องมี --page และ --body
/cortex-remember --page "<ชื่อแนวคิด>" --body "<เนื้อหา>" --tags "a,b"
```

ถ้าบทเรียนซ้ำของเดิม → ตอบ `recurrence — hits bumped` (นับซ้ำ ไม่สร้างซ้ำ) · หน้าชื่อซ้ำ → `updated` (อัปเดตหน้าเดิม)

### `/cortex-think` — คิดลึกตามต้องการ

```bash
/cortex-think "ทำไม build ถึง fail ไม่คงเส้นคงวา"
```

รวม **วินัยการคิด + นิวรณ์5 + ความจำที่เกี่ยวข้อง + เตือนถ้าเคยวนแก้ปัญหานี้** มาโฟกัสที่ปัญหาเดียว
ใช้เป็นโครงช่วยคิด ไม่ใช่คำตอบสำเร็จรูป

---

## 4. เครื่องมือ MCP (ให้ Claude ดึงความจำกลางทาง)

ความจำส่วนใหญ่อัตโนมัติ แต่ cortex มี MCP server (`cortex-memory`) ให้ Claude ดึงเองตอนต้องการ:

| เครื่องมือ | ทำอะไร |
|---|---|
| `memory_recall` | ดึงบทเรียน (Core Memory) + ความรู้ (LLM-Wiki) ตาม query — คืนพร้อมคำเตือนความสด |
| `memory_commit` | บันทึก 1 บทเรียน (กันซ้ำด้วย signature) หรือ 1 หน้าความรู้ (อัปเดตตามชื่อ) |
| `wiki_search` | ค้น LLM-Wiki ตาม query หรือดูสารบัญทั้งหมด |

ต้องมี Bun ใน `PATH` · ถ้าไม่มี server แค่ไม่ connect ส่วนอื่นของ Claude Code ไม่กระทบ

---

## 5. การตั้งค่า (Config)

คัดลอก `cortex.local.md.example` ไปเป็น `.claude/cortex.local.md` (ระดับโปรเจกต์) หรือ
`~/.claude/cortex.local.md` (ระดับผู้ใช้) · **env var มีความสำคัญเหนือไฟล์**

| ตั้งค่า | env var | ค่าเริ่มต้น |
|---|---|---|
| เปิด/ปิด cortex | `CORTEX_ENABLED` | `true` |
| ollama host | `OLLAMA_HOST` | `http://localhost:11434` |
| ollama cloud key | `OLLAMA_API_KEY` | — |
| โมเดล embedding | `CORTEX_EMBED_MODEL` | `nomic-embed-text` |
| โมเดลบีบอัด | `CORTEX_COMPRESS_MODEL` | `qwen2.5:3b` |
| ยกระดับเป็น Claude | `CORTEX_ESCALATION` | `false` |
| โมเดลที่ยกระดับ | `CORTEX_ESCALATION_MODEL` | `sonnet` |
| โฟลเดอร์ความจำ | `CORTEX_MEMORY_DIR` | `$CLAUDE_CONFIG_DIR/cortex/memory` |
| ปิด Cognition | `CORTEX_COGNITION` | `true` (ตั้ง `0` เพื่อปิด) |
| policy บันทึก decision | `CORTEX_CAPTURE_DECISIONS` | `true` (ตั้ง `0` เพื่อปิด) |

> **การยกระดับเป็น Claude** (`escalation`) รันผ่าน `claude` CLI จึงใช้ auth เดียวกับ Claude Code —
> สมาชิก Pro/Max ใช้ได้โดยไม่ต้องมี API key เปิดไว้เพื่อให้การสรุปความจำแม่นขึ้นเมื่อโมเดลเล็กไม่พอ

---

## 6. แก้ปัญหาที่พบบ่อย (FAQ)

**Q: `/cortex status` บอก savings เป็น 0?**
ปกติ — ด้วยโมเดล ollama เล็กในเครื่อง การบีบอัดมักไม่ทันใต้กรอบเวลา sync (15 วินาที) จึง no-op อย่างปลอดภัย
จะได้ผลจริงต้องใช้ backend ที่เร็วกว่า (GPU/cloud) ไม่ใช่บั๊ก

**Q: ค้นความจำแล้วไม่เจอด้วย vector?**
เช็คว่าดึง embed model แล้ว (`ollama pull nomic-embed-text`) หรือชี้ไปโมเดลที่มีด้วย `CORTEX_EMBED_MODEL`
ถ้าไม่มี ollama → ยังค้นได้ด้วยคีย์เวิร์ด (FTS) แค่ไม่มีการค้นเชิงความหมาย

**Q: อยากปิด cortex ชั่วคราว?**
`/cortex off` ปิดเฉพาะโหมดกระชับ · ปิดทั้งหมดตั้ง `CORTEX_ENABLED=0` หรือ `enabled: false` ในไฟล์ config

**Q: cortex จะเขียนทับไฟล์ `.cortex/handoff.md` ที่ผมเขียนเองไหม?**
ไม่ — ถ้าไฟล์ไม่มีเครื่องหมายของ cortex (เป็นไฟล์ที่คนเขียน) cortex จะไม่แตะเลย

**Q: งานเขียน/วิจัย/เทรด จะโดนวินัยการเขียนโค้ดรบกวนไหม?**
ไม่ — วินัยเฉพาะโค้ด (karpathy/graphify) ฉีดเฉพาะเมื่อตรวจพบว่าเป็นงานโค้ด ตัวตรวจตั้งไว้แบบ "แม่นก่อนครบ"
(ยอมพลาดเคสก้ำกึ่งดีกว่าฉีดผิดใส่งานอื่น)

---

## 7. อ้างอิงเพิ่มเติม

- **README** (อังกฤษ, ภาพรวม + brain model): [`README.md`](./README.md)
- **CHANGELOG** (บันทึกเวอร์ชัน): [`CHANGELOG.md`](./CHANGELOG.md)
- **VERIFY** (เช็กลิสต์ติดตั้ง/ตรวจสอบ): [`VERIFY.md`](./VERIFY.md)
- **ROADMAP** (แผนงาน + ความคืบหน้า): [`../ROADMAP.md`](../ROADMAP.md)

**License:** BUSL-1.1 — source-available, แปลงเป็น Apache-2.0 วันที่ 2030-06-15
