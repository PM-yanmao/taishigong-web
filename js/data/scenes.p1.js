/* ===== src/data/scenes.p1.js ===== */
/**
 * 《太史公》剧本数据 · 第一部分
 * 序章 6 页 + 李陵之祸 5 页
 * ------------------------------------------------------------------
 * 文案规范（全文统一，后续批次遵守）：
 *   1. 第二人称"你"，叙述者隐去，不评论、不解释、不总结。
 *   2. 半文言白话：句短，少形容词，多用动作与实物（竹简、灯、雪、路边的老人）。
 *   3. 不煽情、不说教、不现代化。情绪靠留白与史料的重量，不靠感叹号。
 *   4. 史料引用只作暗引（可考者出《史记·太史公自序》《报任安书》《汉书》），
 *      不标注、不打断；玩家查得到是彩蛋，查不到也不影响理解。
 *   5. 每页 150–260 字；选项文案 8–18 字，用动作或判断句，不用问句。
 *   6. 隐藏数值绝不外露；属性提示只能通过"选项是否可用 / 语气是否笃定"间接可感。
 * ------------------------------------------------------------------
 *
 * Option 字段约定（与 src/engine.js 对应）：
 *   id, text
 *   effect: { d:{四维增减}, flags:{标记}, piece:图鉴片, route:切换分支, badCause:BAD死因 }
 *   gate:   { stat|flag, min, selectableWhenFailing?, failTerminal? }
 *   next:   下一节点
 *   terminal: { endingId, cause }   // 直接终局
 */
const SCENES_P1 = {
  /* ===================== 序章 ===================== */

  P1: {
    id: 'P1',
    title: '壮游江淮',
    era: '元朔年间 · 你二十岁',
    art: 'assets/scene/P1.jpg',
    text:
      '你二十岁，出了长安。\n\n' +
      '父亲给你一笔钱，一句话：去看。\n\n' +
      '你渡江，上会稽，探禹穴；窥九疑，浮沅湘。山雾终年不散。你在乡野问老人：此地古时何名，何年置县，何人为守。他们把祖辈的话讲给你听，讲错了，你也不辩。\n\n' +
      '北上汶、泗，你到了鲁地。孔子的庙堂还在，礼器还在，乡射的礼节还在。你在那儿站了很久，忽然明白父亲那句"去看"是什么意思——\n\n' +
      '史书里的人是死的，地是活的。\n\n' +
      '回程困于鄱、薛、彭城，盘缠将尽。你在梁、楚之间遇见饥民，遇见豪强，遇见一个把官印挂在腰间、却不知律令为何物的县丞。\n\n' +
      '你把它们都记了下来。',
    options: [
      { id: 'A', text: '深入乡野，问俗访古', effect: { d: { jian: 10 }, flags: { travel: 1, truth: 1 }, piece: 1 }, next: 'P2' },
      { id: 'B', text: '走马观花，只记郡县沿革', effect: { d: { ming: 5, jian: 5 }, flags: { travel: 1 } }, next: 'P2' },
      { id: 'C', text: '沿途结交豪强，收下帛金', effect: { d: { cai: 10, quan: 5 }, flags: { companion: 1 } }, next: 'P2' },
    ],
  },

  P2: {
    id: 'P2',
    title: '父丧受命',
    era: '元封元年 · 洛阳',
    art: 'assets/scene/P2.jpg',
    text:
      '武帝东封泰山。\n\n' +
      '父亲病在洛阳，不得从行。他躺在榻上，望着窗外，说：\n\n' +
      '"今天子接千岁之统，封泰山，而余不得从行，是命也夫，命也夫！"\n\n' +
      '你赶到时，他已不能起身。他握着你的手，哭：\n\n' +
      '"余先，周室之太史也。自上世尝显功名于虞夏，典天官事。后世中衰，绝于余乎？汝复为太史，则续吾祖矣。"\n\n' +
      '灯芯爆了一下。他又说：\n\n' +
      '"余死，汝必为太史；为太史，无忘吾所欲论著矣。"\n\n' +
      '你俯首流涕，答："小子不敏，请悉论先人所次旧闻，不敢阙。"\n\n' +
      '那一夜他去了。你在他枕边发现一卷未写完的竹简，最后一行的墨还没有干。',
    options: [
      { id: 'A', text: '跪受遗命，以史为业', effect: { d: { jian: 10, ming: 10 }, flags: { truth: 1 }, piece: 2 }, next: 'P3' },
      { id: 'B', text: '心知此志难成，含糊应下', effect: { d: { quan: 10, ming: 3 }, flags: { hypocrisy: 1 } }, next: 'P3' },
      { id: 'C', text: '直言力不能及，请父另托', effect: { d: { jian: -10, ming: -5 } }, next: 'P3' },
    ],
  },

  P3: {
    id: 'P3',
    title: '太史令任上',
    era: '元封三年 · 长安',
    art: 'assets/scene/P3.jpg',
    text:
      '你为太史令。\n\n' +
      '官舍在城南，屋漏，书多。你整理石室金匮之藏，尽是断简残编，虫蛀鼠啮。有一卷记着景帝年间的日食，墨迹已糊，你辨了三个晚上。\n\n' +
      '有人来找你，笑着递上一封帛书：某郡守的祖父，当年曾"从高祖定天下"，求你在档案里补一句。\n\n' +
      '"谢礼不薄。"他说。\n\n' +
      '你查过了。那人的祖父，是个屠户。\n\n' +
      '窗外落雪。你把帛书推回去，手指压在"高祖"两个字上。',
    options: [
      { id: 'A', text: '严词拒绝，如实掌籍', effect: { d: { ming: 10, cai: -5 }, flags: { truth: 1 }, piece: 3 }, next: 'P4' },
      { id: 'B', text: '收下润笔，替他补一句', effect: { d: { cai: 15, ming: -10 }, flags: { companion: 1 } }, next: 'P4' },
      { id: 'C', text: '假装糊涂，两头逢源', effect: { d: { quan: 10 }, flags: { hypocrisy: 1, companion: 1 } }, next: 'P4' },
    ],
  },

  P4: {
    id: 'P4',
    title: '泰山封禅',
    era: '太初三年 · 东巡道上',
    art: 'assets/scene/P4.jpg',
    text:
      '封禅的队伍走了三个月。\n\n' +
      '沿途郡县治道，民夫塞路，粟米转运千里。你在车驾之末，看得见锦旗，也看得见倒在路边的老人。\n\n' +
      '到了泰山下，依元封旧仪，修五年之礼，加禅石闾。真正封禅的那一夜，从者稀少。山上的事，外间无人得知。\n\n' +
      '事后有人问，这一页当如何记。\n\n' +
      '你想起路边那个老人。他的草鞋磨穿了，脚趾露在外面，沾着泥。\n\n' +
      '你提笔，先写下日子。',
    options: [
      { id: 'A', text: '直笔记录，暗陈奢靡', effect: { d: { ming: 10, jian: 5 }, flags: { truth: 1 }, piece: 4 }, next: 'P5' },
      { id: 'B', text: '只记祥瑞，删去路边老人', effect: { d: { cai: 15, quan: 5, ming: -10 }, flags: { favor: 1 } }, next: 'P5' },
      { id: 'C', text: '缄默不语，只记仪轨', effect: { d: { jian: 5, quan: 5 }, flags: { hypocrisy: 1 } }, next: 'P5' },
    ],
  },

  P5: {
    id: 'P5',
    title: '朝中结交',
    era: '太初四年 · 长安',
    art: 'assets/scene/P5.jpg',
    text:
      '廷尉杜周的门前，车马终日不绝。\n\n' +
      '有人引你去。杜周待你很客气，说太史令掌天官，日后修历、记事，都有用得着的地方。\n\n' +
      '你不置可否。\n\n' +
      '回来时，同僚问你，去，还是不去。\n\n' +
      '你没有答。你想起杜周案上的卷宗，厚厚一叠，都是用刑具压出来的口供。也想起父亲那卷竹简，还压在案上，只有开头。\n\n' +
      '灯下，你把白天记的几行字誊清，又磨了墨。',
    options: [
      { id: 'A', text: '与清流往来，不结私党', effect: { d: { ming: 10, jian: 5 }, flags: { truth: 1 }, piece: 5 }, next: 'P6' },
      { id: 'B', text: '登杜周之门，问内廷事', effect: { d: { quan: 10, ming: -15 }, flags: { hypocrisy: 1, companion: 1 } }, next: 'P6' },
      { id: 'C', text: '两面逢源，各留余地', effect: { d: { quan: 8, ming: -5 }, flags: { hypocrisy: 1, companion: 1 } }, next: 'P6' },
    ],
  },

  P6: {
    id: 'P6',
    title: '李陵出征前夜',
    era: '天汉二年秋',
    art: 'assets/scene/P6.jpg',
    text:
      '李陵请以五千步卒，出居延，击匈奴。\n\n' +
      '朝中都在议论他。有人说他狂，有人说他必败。\n\n' +
      '你与他俱居门下，素非相善。但你观其为人：事亲孝，与士信，临财廉，取与义，分别有让，恭俭下人，常思奋不顾身，以徇国家之急。\n\n' +
      '这样的人，不该败。\n\n' +
      '次日，李陵召见武台，五千人列在台下。武帝在台上看。你站在人群里，看见李陵回头望了一眼长安。\n\n' +
      '那一眼很短。',
    options: [
      { id: 'A', text: '断言孤军必败，先留后路', effect: { d: { jian: 10, quan: 5 } }, next: 'L1' },
      { id: 'B', text: '随众称贺，说他必封侯', effect: { d: { ming: -5, cai: 5 }, flags: { favor: 1 } }, next: 'L1' },
      { id: 'C', text: '默察其为人，心许之国士', effect: { d: { ming: 10, jian: 5 }, flags: { truth: 1 }, piece: 6 }, next: 'L1' },
      { id: 'E', text: '把那一眼记进简里', showIf: { flag: 'truth', min: 4 }, effect: { d: { jian: 3 }, flags: { truth: 1 } }, next: 'L1' },
      {
        id: 'D',
        text: '当众讥讽武帝用人（凶多吉少）',
        effect: {},
        terminal: { endingId: 13, cause: 'T1' },
      },
    ],
  },

  /* ===================== 李陵之祸 ===================== */

  L1: {
    id: 'L1',
    title: '朝议',
    era: '天汉二年十一月',
    art: 'assets/scene/L1.jpg',
    text:
      '边报入京，从居延来。驿骑在殿门外下马，甲上的雪还没拍净，文书就一层层递上去。\n\n' +
      '李陵降。\n\n' +
      '武帝大怒，召群臣议。满殿的人都在说话，说的都是一个字：斩。有人说该族，有人说该诛其三族，有人已经在写奏章了。奏章摊在膝上，笔尖悬着，等人先开口。\n\n' +
      '殿角的炭盆烧得发白，柱子上的漆被熏出一层暗光。你站在班末，手里那块笏板比平日凉。\n\n' +
      '殿上安静下来的时候，武帝看着你。\n\n' +
      '"太史令，你说。"\n\n' +
      '你听见自己的心跳，一下，一下，压过殿外的风声。父亲那卷竹简还在案上，只写到"太史公曰"四个字。写，或不写，只在此刻。',
    options: [
      { id: 'A', text: '出言为李陵辩护，犯颜直谏', effect: { d: { ming: 10, jian: 5 }, flags: { truth: 1 }, piece: 7, route: 'PUNISH' }, next: 'L2A' },
      { id: 'B', text: '沉默不语，称病不朝', effect: { d: { quan: 5 }, flags: { travel: 1 }, route: 'RETIRE' }, next: 'L2B' },
      { id: 'C', text: '附和满殿，说李陵该族', effect: { d: { quan: 10, ming: -10 }, flags: { favor: 1 }, route: 'FLATTER' }, next: 'L2C' },
    ],
  },

  L2A: {
    id: 'L2A',
    title: '议罪',
    era: '廷尉府',
    art: 'assets/scene/L2A.jpg',
    text:
      '廷尉议：诬罔，当死。\n\n' +
      '判词写在牍上，墨还未干，被你自己的手汗洇开了一角。堂上问你可有话说。\n\n' +
      '你本可以不说。判词已定，再多说一句，只会更重。堂下的刑具摆在草席边，铁环上没有锈，像是日日都在用。\n\n' +
      '可是父亲那卷竹简上，只写到"太史公曰"四个字。\n\n' +
      '堂下有人轻轻咳了一声。那是你曾托过的旧识，此刻低着头，看自己的脚尖。\n\n' +
      '堂上拍案：囚徒，速言。',
    options: [
      { id: 'A', text: '伏法认罪，一言不发', effect: { flags: { truth: 1 }, piece: 8 }, next: 'L3' },
      {
        id: 'B',
        text: '当庭指斥酷吏，不留余地',
        effect: { d: { ming: 15 }, flags: { truth: 1 } },
        gate: {
          stat: 'ming',
          min: 55,
          selectableWhenFailing: true,
          failTerminal: { endingId: 13, cause: 'T2' },
        },
        next: 'L3',
      },
      {
        id: 'C',
        text: '托旧识打点廷尉，求一线生路',
        effect: { d: { quan: 8 }, flags: { companion: 1 } },
        gate: { flag: 'companion', min: 1 },
        next: 'L3',
      },
    ],
  },

  L2B: {
    id: 'L2B',
    title: '免官',
    era: '天汉二年冬',
    art: 'assets/scene/L2B.jpg',
    text:
      '你没说话。\n\n' +
      '称病，不朝。宫门外的车马照旧，只是少了你一辆。三个月后，诏书下来：免官。\n\n' +
      '没有罪名。也没有解释。\n\n' +
      '你收拾书箧时，同僚都避开了。官舍里的简捆成几束，绳是新换的。只有一个小吏，帮你把最后一捆竹简搬上车，搬完就退到墙边，不敢多站。\n\n' +
      '交印那天，铜印在案上磕了一声。出了城门，你回头看了一眼长安的宫墙。天很高。',
    options: [
      { id: 'A', text: '上疏自陈，请归乡修史', effect: { d: { ming: 10, jian: 5 }, flags: { truth: 1, travel: 1 } }, next: 'B1' },
      { id: 'B', text: '闭门不出，静待风波', effect: { d: { jian: 10 }, flags: { travel: 1 } }, next: 'B1' },
    ],
  },

  L2C: {
    id: 'L2C',
    title: '升迁',
    era: '天汉二年冬',
    art: 'assets/scene/L2C.jpg',
    text:
      '你的话，正合上意。\n\n' +
      '三日后，擢为中郎将。又三日，赐帛百匹。帛一匹匹堆在案上，颜色很新，新得有些刺眼。\n\n' +
      '有人来贺，说太史令终于"懂事"了。贺客坐满半间屋子，茶换了三遍，谁都没提李陵。\n\n' +
      '你笑着受贺，送客到门口，袖口攥出了一道褶。\n\n' +
      '夜里你点灯，看父亲那卷竹简。看了很久，又把它收进箱底，压上一块石头。',
    options: [
      { id: 'A', text: '受赏谢恩，从此迎合', effect: { d: { cai: 15, ming: -10, quan: 5 }, flags: { favor: 1, companion: 1 } }, next: 'C1' },
      { id: 'B', text: '表面谢恩，内心不安', effect: { d: { ming: 5 }, flags: { hypocrisy: 1, favor: 1 } }, next: 'C1' },
    ],
  },

  L3: {
    id: 'L3',
    title: '生死抉择',
    era: '天汉三年 · 狱中',
    art: 'assets/scene/L3.jpg',
    text:
      '狱中不见天日。草席铺在潮地上，边缘已经磨白，墙角有一道水痕，一天只挪半寸。\n\n' +
      '判词已下：死。\n\n' +
      '家贫，货赂不足以自赎；交游莫救，左右亲近不为一言。\n\n' +
      '狱吏又来了，把三样东西摆在席上：一匹帛，一把刀，一条绳。他说：纳钱，或受刑，或引颈。三者，择一。说完就退到门边，不催。\n\n' +
      '你想起父亲。想起那卷竹简，只写到"太史公曰"四个字。想起武台下，五千人里那一次回头。\n\n' +
      '灯灭了。',
    options: [
      { id: 'X1', text: '接受宫刑，苟活写史', effect: { d: { jian: 10 }, flags: { truth: 1 }, piece: 9 }, next: 'A1' },
      { id: 'X2', text: '拒绝受刑，引颈就戮', effect: { d: { ming: 10 }, flags: { truth: 1 }, route: 'DIE' }, next: 'D1' },
      {
        id: 'X3',
        text: '变卖家产，纳钱赎死',
        effect: { d: { cai: -70 }, route: 'REDEEM' },
        gate: { stat: 'cai', min: 80 },
        next: 'R1',
      },
    ],
  },
};
