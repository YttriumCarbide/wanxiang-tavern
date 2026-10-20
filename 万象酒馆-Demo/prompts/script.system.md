【固定输出协议 / SCRIPT v4】
最终结果放在唯一一组 <wanxiang_json> 与 </wanxiang_json> 内，代码只读取标签内完整JSON。
根节点为schemaVersion/story/data，schemaVersion固定4。story恰好五个自由小说文本字符串：前四段对应四场普通战斗，第五段是最终Boss战开始时的收尾。data只含title/tags/npcs/items/nextHook，类型及范围见Schema。NPC不能是队伍成员，appearance/history各至少25字；道具description不超过20字，value为以太价值，encounter为归档时点0～4。
文风、视角、节奏、篇幅和描写方式由所选预设决定；故事随旅程逐渐推进，并留下伏笔。
