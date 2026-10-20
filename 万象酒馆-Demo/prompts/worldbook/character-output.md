【角色生成输出格式 / CHARACTER v3】
最终结果必须使用唯一一组 <wanxiang_json> 与 </wanxiang_json> 包裹，标签单独成行，内部为下述JSON。标签不要写进JSON字符串，不嵌套、不重复、不使用其他标签名。代码只读取这组标签内的内容，标签外的文字不属于角色或剧本；无需输出思考过程或自查。
标签内仅输出一个完整JSON对象，schemaVersion固定数字3，按schemaVersion、setting、data顺序书写，召唤时根节点再附arrivalDialogue。禁止Markdown围栏、额外XML、game_data附录、尾逗号、省略号和未规定字段。
setting只允许name/gender/age/appearance/profession/personality/history/attack/skills/entrySkill，其中age可自由填写文字、数字、留空或省略，不做内容校验，其余字段必填（每个角色都必须有entrySkill）。profession、attack、entrySkill、每项setting.skills恰好是{name,description}，两个值都为字符串。skills恰好两项。不得增加description_note、notes、reason、评价或说明子对象，正文写入规定字符串。
personality必须直接写成一个字符串，例如"严谨务实，习惯先核实事实。"，不要仿照profession写成{name,description}对象。name、gender、appearance、history也直接填写字符串。
data必须包含archetype/hp/mp/attack/weapon/limit/skills/entrySkill。每个角色都必须生成专属entrySkill。data不生成name、title、attackName，data.skills与data.entrySkill也不生成name；这些名称由代码直接从setting读取。data.skills[0]对应setting.skills[0]，data.skills[1]对应setting.skills[1]，不能打乱槽位顺序。
主动技能含text/ap/mp/target/effects；需要消耗生命时可额外填写hp（1～20整数，生命必须严格大于此消耗才能施放），不加passive:false、location、description或独立damage字段。被动技能使用Schema允许的统一rules结构或旧四种兼容形状，不混入主动费用与effects。
entrySkill为每个角色必须具备的专属入场技（无论主角还是召唤同行者，每个角色都必须生成入场技）：角色在后排待满一个整回合后换入前场自动触发，不额外消耗AP或行动点；含text/target/effects，target从allEnemies/allAllies/self中选择，effects包含1～3项效果。
effects中damage/heal/shield/selfHeal/selfMana只含type/value；selfMana为回复施法者法力，不超过法力上限；buff只含type/buff/value；cleanse只含type/buffs。数值使用JSON数字，布尔值使用true/false，不填单位或用空字符串补字段。
设定纯文字须1000～1500参考tokens，经历150～260字。所有费用、范围、目标、状态ID与被动结构须符合下附Schema和本次mechanics，输出前静默检查完整性与技能槽位对应，不输出检查过程。

【输出标签唯一性】
整条可见回复中，输出标签只能作为最终JSON的外层边界各出现一次，严禁嵌套或重复。不要在思考、规划、吐槽、自查、解释、示例或Markdown代码中复述完整的开始或结束标签，也不要引用本协议的标签写法。若预设要求额外说明，只能用“输出边界”等普通文字指代；无需输出思考过程或格式自查。

【本次任务与示例边界】
按request.brief生成本次的新角色；existingCharacters只用于避免重复。Assistant中的格式示例不代表当前角色，不得把示例人物的姓名、经历或技能原样当作生成结果。

本次动态JSON Schema（角色ID、类型和允许范围由代码提供）：
{{outputSchema}}

不生成ultimate、quest、awakening字段；当前版本没有奥义或觉醒系统，只设计普攻、两个技能与专属入场技。


【装备与被动统一事件规则】
新被动可用{passive:true,text:"中文实际效果",rules:[...]}，每条规则按本次mechanics.passives.unifiedRules和Schema设计。持续光环不写event/limit，事件规则必须有单趟limit，装备和被动效果不递归触发。条件按当前实际状态全部同时判断。
召唤角色（非创建主角）根节点必须附arrivalDialogue，2～5项{speaker:"character"或"player",text:"中文对白"}，角色与主角自然交谈，不强制引导。此项仅本次展示，不写入setting或角色记忆。已知NPC任务忠实保留request.knownNpc原姓名与经历。潘多拉不可抽取，仅由第三次完整副本结算后的事件加入。

【1.3 行程与成长规则更新】
【主角升级台词】
为主角生成时，根节点额外输出levelUpLines数组，恰好5句符合其性格的简短升级台词。两个技能槽各自可以设计为主动或被动，普通攻击独立存在。
