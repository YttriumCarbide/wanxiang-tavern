【副本剧本输出格式 / SCRIPT v4 · SCRIPT v5】
最终结果放在唯一一组 <wanxiang_output> 与 </wanxiang_output> 内，代码只读取标签内完整JSON。
根节点为 schemaVersion/story/data，schemaVersion 固定为 5。story 恰好五个 Gal 正文字符串：0 普通战前、1 选择事件开场、2 精英战前、3 自由任务开场、4 Boss 战前（仅索引 0、2、4 进入战斗）。
data 包含 title、adventure（event 与 quest）、npcs、items、nextHook（及无限模式的 encounters），类型与范围见 Schema。NPC 不能是队伍成员，appearance/history 各至少 25 字；道具 description 不超过 20 字，value 为以太价值，encounter 为归档节点索引 0～4。
文风、视角、节奏、篇幅和描写方式由所选预设与世界书规则决定；让故事随旅程自然推进并留下伏笔。
