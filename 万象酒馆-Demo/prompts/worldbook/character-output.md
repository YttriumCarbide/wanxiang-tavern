【角色生成输出格式 / CHARACTER v4】
最终结果必须使用唯一一组 <wanxiang_json> 与 </wanxiang_json> 包裹，标签单独成行，内部为一个完整JSON对象。标签不写进JSON字符串，不嵌套、不重复。无需输出思考过程或自查，不输出Markdown围栏、game_data、额外XML、省略号或未规定字段。
根节点依次为schemaVersion、setting、data，schemaVersion固定4。召唤时附arrivalDialogue，2～5项{speaker:"character"或"player",text:"中文对白"}；主角附levelUpLines，恰好5句符合性格的升级台词。两者只按本次用途输出，不写入setting。
setting只允许name/gender/age/appearance/profession/personality/history/attack/skills/entrySkill。age可省略或自由文字/数字；profession、attack、entrySkill和两项skills为{name,description}，其余直接是字符串。personality是字符串，不能写成对象。skills恰好两项，entrySkill必填。被动description解释实际效果、触发条件及次数，不能写成主动释放动作。
data必须包含archetype/weapon/profile/skills/entrySkill，可按Schema增加唯一mark声明；不写hp、mp、attack、limit、等级或其他具体数值。archetype只决定现有战斗模板，weapon是sword/staff/bow演出类别，profile选择战斗定位。姓名与技能名称只在setting生成，data不重复，技能按同序槽位对应。
data.skills中的主动形状为{kind:"active",ap:1或2,cost:"low"或"standard"或"high",target,effects}；被动为{kind:"passive",rules}。每个效果用type与power档位，buff/cleanse/mark及条件/标记消耗的细节严格按动态Schema，禁止输出实际value数值。每技能最多两项主要效果。被动持续光环与事件规则互斥，事件带明确scope和limit档位；一次触发不递归引发新触发。
entrySkill为{target,effects}，无AP或资源费用。opposite只命中正对位存活敌人，无目标时空放；其他目标只选Schema允许项。附加效果可按Schema单独选对象，确保治疗和增益不会施加给敌人。
不生成ultimate、quest、awakening、变身、多形态或第三技能。设定纯文字目标1000～1500参考tokens，经历150～260字；按request.brief及本次固定计划创作。

【输出标签唯一性】
整条可见回复中，输出标签只能作为最终JSON的外层边界各出现一次，严禁嵌套或重复。不要在思考、规划、吐槽、自查、解释、示例或Markdown代码中复述完整的开始或结束标签；无需输出思考过程或格式自查。

【本次任务与示例边界】
没有供复制的完整示例人物。官方数值参考只用于理解游戏尺度，不是本次已生成的角色，禁止照抄姓名、人设或整个技能组合。existingCharacters只用于避免重复。已知NPC任务保留request.knownNpc原姓名、外貌、身份与经历。潘多拉不可抽取，仅事件加入。

本次动态JSON Schema：
{{outputSchema}}
