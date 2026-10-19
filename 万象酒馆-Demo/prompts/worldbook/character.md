【角色生成 · 人物设定】
以角色本身为中心设计人物：姓名、性别、年龄、可辨识的外貌与装备、职业训练与工作能力、稳定性格、说话习惯、行为逻辑和个人边界。
写设定集，直接明确，不写小说开场、镜头切换、情绪铺陈或悬念。职业、性格与经历共同决定攻击方法、技能动作，不先随机抽取数值再编背景。
经历目标约200字，保持150～260字：简述原世界身份与少量关键经历，写召唤前正在做的事，结尾是四周变白，再次睁眼已在万象酒馆召唤之门门口。不扩写长篇传记，不发明失忆、契约或幕后阴谋。
普攻、两个技能都需要可理解的动作描写；例如聚光成球、持盾撞击、移动到队友身侧保护。被动写可观察的持续表现，不写成必须额外释放的法术。盾撞可用近战动画，人物手里的盾仍是盾。
设定纯文字合计1000～1500tokens，以o200k_base为参考，建议1200～1400；重点分配给外貌、职业、性格和动作，经历保持简短。设定文字不写生命、蓝量、AP、伤害数值、状态层数或代码术语。
world是公共世界观，request是本次OC要求与避免重复名单；人物私有经历不能改写酒馆的公共历史。

不生成ultimate、quest、awakening字段；当前版本没有奥义或觉醒系统，只设计普攻和两个技能。

【角色生成 · 能力与游戏规则】
人物设计完成后，根据mechanics中当前代码真实支持的资源、行动、动画、主动效果、已支持状态、四种被动位置推导数值。职业与能力主题要一致，耐久、输出、法术储备与行动次数有所取舍，不堆满所有上限。
普通攻击消耗1AP、0蓝，attack是基础伤害。weapon只从sword/bow/staff选择，这是演出类别；近战sword也承载盾撞与重装冲击，不要求改写人物装备。
两个技能至少一个主动。被动只选一种已实现的结构与前场/后场/全战斗/战斗外位置。持续再生、中毒和流血按真实状态层结算，不能伪装成永久光环。不生成奥义、觉醒任务或第三种额外能力。
不发明额外AP、任意召唤、复活、抽牌、眩晕、概率、自定义持续回合、脚本或新触发条件。治疗动作、攻击主题和增减益效果应对应人物定位，状态含义以mechanics.statuses为准。
名称只在setting生成一次；data的两个技能按同序槽位读取setting.skills，普攻读取setting.attack。data会由代码继承这些名称并编译成独立战斗定义；setting去掉结构外壳后保存为纯文字人物设定。后续剧情与聊天只读取人物文字，不携带机械JSON；原始响应只保留在生成诊断中。

不生成ultimate、quest、awakening字段；当前版本没有奥义或觉醒系统，只设计普攻和两个技能。

【角色生成输出格式 / CHARACTER v3】
最终结果必须使用唯一一组 <wanxiang_json> 与 </wanxiang_json> 包裹，标签单独成行，内部为下述JSON。标签不要写进JSON字符串，不嵌套、不重复、不使用其他标签名。代码只读取这组标签内的内容，标签外的文字不属于角色或剧本；无需输出思考过程或自查。
标签内仅输出一个完整JSON对象，schemaVersion固定数字3，按schemaVersion、setting、data顺序书写。禁止Markdown围栏、额外XML、game_data附录、尾逗号、省略号和未规定字段。
setting只允许name/gender/age/appearance/profession/personality/history/attack/skills，其中age可自由填写文字、数字、留空或省略，不做内容校验，其余字段必填。profession、attack、每项setting.skills恰好是{name,description}，两个值都为字符串。skills恰好两项。不得增加description_note、notes、reason、评价或说明子对象，正文写入规定字符串。
data必须包含archetype/hp/mp/attack/weapon/limit/skills。data不生成name、title、attackName，data.skills也不生成name；这些名称由代码直接从setting读取。data.skills[0]对应setting.skills[0]，data.skills[1]对应setting.skills[1]，不能打乱槽位顺序。
主动技能仅含text/ap/mp/target/effects，不加passive:false、location、description或独立damage字段。被动技能仅采用Schema允许的四种形状，不混入主动费用与effects。
effects中damage/heal/shield/selfHeal只含type/value；buff只含type/buff/value；cleanse只含type/buffs。数值使用JSON数字，布尔值使用true/false，不填单位或用空字符串补字段。
设定纯文字须1000～1500参考tokens，经历150～260字。所有费用、范围、目标、状态ID与被动结构须符合下附Schema和本次mechanics，输出前静默检查完整性与技能槽位对应，不输出检查过程。

【输出标签唯一性】
整条可见回复中，输出标签只能作为最终JSON的外层边界各出现一次，严禁嵌套或重复。不要在思考、规划、吐槽、自查、解释、示例或Markdown代码中复述完整的开始或结束标签，也不要引用本协议的标签写法。若预设要求额外说明，只能用“输出边界”等普通文字指代；无需输出思考过程或格式自查。

【本次任务与示例边界】
按request.brief生成本次的新角色；existingCharacters只用于避免重复。Assistant中的格式示例不代表当前角色，不得把示例人物的姓名、经历或技能原样当作生成结果。

本次动态JSON Schema（角色ID、类型和允许范围由代码提供）：
{{outputSchema}}

不生成ultimate、quest、awakening字段；当前版本没有奥义或觉醒系统，只设计普攻和两个技能。
