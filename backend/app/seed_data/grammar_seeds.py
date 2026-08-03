GRAMMAR_SEED = [
    # sentence_structure
    {"pattern": "Xは Yです", "meaning_en": "X is Y", "example_jp": "私は学生です", "example_en": "I am a student", "category": "sentence_structure"},
    {"pattern": "Xは Yじゃないです / ではありません", "meaning_en": "X is not Y (negative)", "example_jp": None, "example_en": None, "category": "sentence_structure"},
    {"pattern": "Xは Yでした", "meaning_en": "X was Y (past)", "example_jp": None, "example_en": None, "category": "sentence_structure"},
    {"pattern": "Xは Yじゃなかったです / ではありませんでした", "meaning_en": "X was not Y (past negative)", "example_jp": None, "example_en": None, "category": "sentence_structure"},
    {"pattern": "Xは Yですか", "meaning_en": "question form (add か)", "example_jp": None, "example_en": None, "category": "sentence_structure"},
    {"pattern": "~も", "meaning_en": "also / too", "example_jp": "私も学生です", "example_en": "I am also a student", "category": "sentence_structure"},
    {"pattern": "~の", "meaning_en": "possessive / connector", "example_jp": "私の本", "example_en": "my book", "category": "sentence_structure"},

    # particles
    {"pattern": "は", "meaning_en": "topic marker", "example_jp": None, "example_en": None, "category": "particles"},
    {"pattern": "が", "meaning_en": "subject marker (esp. with question words, new info, likes/dislikes)", "example_jp": None, "example_en": None, "category": "particles"},
    {"pattern": "を", "meaning_en": "direct object marker", "example_jp": None, "example_en": None, "category": "particles"},
    {"pattern": "に", "meaning_en": "time point, destination, indirect object", "example_jp": "7時に起きます / 学校に行きます", "example_en": "I wake up at 7 o'clock / I go to school", "category": "particles"},
    {"pattern": "で", "meaning_en": "location of action, means / method", "example_jp": "図書館で勉強します / バスで行きます", "example_en": "I study at the library / I go by bus", "category": "particles"},
    {"pattern": "へ", "meaning_en": "direction (like に but softer, \"toward\")", "example_jp": None, "example_en": None, "category": "particles"},
    {"pattern": "と", "meaning_en": "\"and\" (for nouns), \"with\"", "example_jp": "友達と行きます", "example_en": "I'll go with a friend", "category": "particles"},
    {"pattern": "や", "meaning_en": "\"and\" (non-exhaustive list)", "example_jp": "りんごやみかん", "example_en": "apples, oranges, etc.", "category": "particles"},
    {"pattern": "から / まで", "meaning_en": "from / until", "example_jp": "9時から5時まで", "example_en": "from 9 o'clock until 5 o'clock", "category": "particles"},
    {"pattern": "も", "meaning_en": "also, too", "example_jp": None, "example_en": None, "category": "particles"},
    {"pattern": "か", "meaning_en": "question marker / \"or\" between options", "example_jp": None, "example_en": None, "category": "particles"},
    {"pattern": "ね", "meaning_en": "seeking agreement (\"right?\")", "example_jp": None, "example_en": None, "category": "particles"},
    {"pattern": "よ", "meaning_en": "emphasis, giving new info", "example_jp": None, "example_en": None, "category": "particles"},
    {"pattern": "の", "meaning_en": "possession/modification; also turns a sentence into a noun-question in casual speech", "example_jp": None, "example_en": None, "category": "particles"},

    # existence_location
    {"pattern": "あります / います", "meaning_en": "there is/are (ある = things, いる = living things)", "example_jp": None, "example_en": None, "category": "existence_location"},
    {"pattern": "~があります / ~がいます", "meaning_en": "X exists", "example_jp": "猫がいます", "example_en": "there is a cat", "category": "existence_location"},
    {"pattern": "~はどこにありますか / いますか", "meaning_en": "where is X?", "example_jp": None, "example_en": None, "category": "existence_location"},
    {"pattern": "~の上/下/中/前/後ろ/隣/近くに", "meaning_en": "on / under / in / in front of / behind / next to / near", "example_jp": None, "example_en": None, "category": "existence_location"},

    # masu_form
    {"pattern": "Vます", "meaning_en": "polite present/future affirmative", "example_jp": None, "example_en": None, "category": "masu_form"},
    {"pattern": "Vません", "meaning_en": "polite present/future negative", "example_jp": None, "example_en": None, "category": "masu_form"},
    {"pattern": "Vました", "meaning_en": "polite past affirmative", "example_jp": None, "example_en": None, "category": "masu_form"},
    {"pattern": "Vませんでした", "meaning_en": "polite past negative", "example_jp": None, "example_en": None, "category": "masu_form"},
    {"pattern": "Vましょう", "meaning_en": "\"let's...\"", "example_jp": "行きましょう", "example_en": "Let's go", "category": "masu_form"},
    {"pattern": "Vましょうか", "meaning_en": "\"shall I/we...?\"", "example_jp": None, "example_en": None, "category": "masu_form"},
    {"pattern": "Vませんか", "meaning_en": "\"won't you...?\" (invitation)", "example_jp": None, "example_en": None, "category": "masu_form"},
    {"pattern": "Vたいです", "meaning_en": "want to (verb)", "example_jp": "食べたいです", "example_en": "I want to eat", "category": "masu_form"},
    {"pattern": "Vたくないです", "meaning_en": "don't want to", "example_jp": None, "example_en": None, "category": "masu_form"},
    {"pattern": "V(stem)に行きます / 来ます", "meaning_en": "go/come to do", "example_jp": "買いに行きます", "example_en": "I'm going to buy (something)", "category": "masu_form"},

    # te_form
    {"pattern": "Vて + ください", "meaning_en": "please do", "example_jp": "待ってください", "example_en": "Please wait", "category": "te_form"},
    {"pattern": "Vて + います", "meaning_en": "is doing (ongoing action) / state resulting from action", "example_jp": "食べています", "example_en": "I am eating", "category": "te_form"},
    {"pattern": "Vても いいです", "meaning_en": "it's okay to do", "example_jp": "食べてもいいです", "example_en": "It's okay to eat / You may eat", "category": "te_form"},
    {"pattern": "Vては いけません", "meaning_en": "must not do", "example_jp": "入ってはいけません", "example_en": "You must not enter", "category": "te_form"},
    {"pattern": "Vて, Vて, Vて", "meaning_en": "connecting sequential actions/states", "example_jp": None, "example_en": None, "category": "te_form"},
    {"pattern": "Vてから", "meaning_en": "after doing", "example_jp": "食べてから行きます", "example_en": "I'll go after eating", "category": "te_form"},

    # plain_form
    {"pattern": "Vる (dictionary form)", "meaning_en": "plain present/future", "example_jp": None, "example_en": None, "category": "plain_form"},
    {"pattern": "Vない (nai form)", "meaning_en": "plain negative", "example_jp": None, "example_en": None, "category": "plain_form"},
    {"pattern": "plain form + こと / つもり, etc.", "meaning_en": "used inside more complex grammar; appears more heavily at N4, but N5 introduces recognition of plain forms", "example_jp": None, "example_en": None, "category": "plain_form"},

    # adjective_conjugation
    {"pattern": "高いです", "meaning_en": "is (expensive) — present, い-adjective", "example_jp": None, "example_en": None, "category": "adjective_conjugation"},
    {"pattern": "高くないです", "meaning_en": "is not — negative, い-adjective", "example_jp": None, "example_en": None, "category": "adjective_conjugation"},
    {"pattern": "高かったです", "meaning_en": "was — past, い-adjective", "example_jp": None, "example_en": None, "category": "adjective_conjugation"},
    {"pattern": "高くなかったです", "meaning_en": "was not — past negative, い-adjective", "example_jp": None, "example_en": None, "category": "adjective_conjugation"},
    {"pattern": "高くて", "meaning_en": "connecting form, い-adjective (~て combines with adjectives too)", "example_jp": None, "example_en": None, "category": "adjective_conjugation"},
    {"pattern": "静かです", "meaning_en": "is (quiet) — present, な-adjective", "example_jp": None, "example_en": None, "category": "adjective_conjugation"},
    {"pattern": "静かじゃないです", "meaning_en": "is not — negative, な-adjective", "example_jp": None, "example_en": None, "category": "adjective_conjugation"},
    {"pattern": "静かでした", "meaning_en": "was — past, な-adjective", "example_jp": None, "example_en": None, "category": "adjective_conjugation"},
    {"pattern": "静かじゃなかったです", "meaning_en": "was not — past negative, な-adjective", "example_jp": None, "example_en": None, "category": "adjective_conjugation"},
    {"pattern": "静かで", "meaning_en": "connecting form, な-adjective", "example_jp": None, "example_en": None, "category": "adjective_conjugation"},
    {"pattern": "adjective + noun", "meaning_en": "な-adjectives take な before a noun", "example_jp": "高い本 / 静かな部屋", "example_en": "expensive book / quiet room", "category": "adjective_conjugation"},

    # comparison
    {"pattern": "AはBより〜", "meaning_en": "A is more ~ than B", "example_jp": "犬は猫より大きいです", "example_en": "Dogs are bigger than cats", "category": "comparison"},
    {"pattern": "AとBとどちらが〜", "meaning_en": "which is more ~, A or B?", "example_jp": None, "example_en": None, "category": "comparison"},
    {"pattern": "~の中で一番〜", "meaning_en": "the most ~ among ~", "example_jp": "果物の中で何が一番好きですか", "example_en": "Which fruit do you like the most?", "category": "comparison"},

    # giving_receiving
    {"pattern": "あげます", "meaning_en": "give (to someone else)", "example_jp": None, "example_en": None, "category": "giving_receiving"},
    {"pattern": "もらいます", "meaning_en": "receive", "example_jp": None, "example_en": None, "category": "giving_receiving"},
    {"pattern": "くれます", "meaning_en": "give (to me/my in-group)", "example_jp": None, "example_en": None, "category": "giving_receiving"},

    # potential_ability
    {"pattern": "~ができます", "meaning_en": "can do (noun + できます)", "example_jp": "日本語ができます", "example_en": "I can speak Japanese", "category": "potential_ability"},
    {"pattern": "Vことができます", "meaning_en": "can do (verb + ことができます)", "example_jp": "泳ぐことができます", "example_en": "I can swim", "category": "potential_ability"},

    # desire_suggestion
    {"pattern": "Vたいです", "meaning_en": "want to do", "example_jp": None, "example_en": None, "category": "desire_suggestion"},
    {"pattern": "~がほしいです", "meaning_en": "want (a thing)", "example_jp": "新しい靴がほしいです", "example_en": "I want new shoes", "category": "desire_suggestion"},
    {"pattern": "Vましょう / Vませんか", "meaning_en": "let's / won't you", "example_jp": None, "example_en": None, "category": "desire_suggestion"},

    # reason_purpose
    {"pattern": "~から", "meaning_en": "because (reason)", "example_jp": "忙しいから、行きません", "example_en": "Because I'm busy, I won't go", "category": "reason_purpose"},
    {"pattern": "~ので", "meaning_en": "because (softer/more polite, N4-leaning but tested at N5 recognition level)", "example_jp": None, "example_en": None, "category": "reason_purpose"},
    {"pattern": "Vに行きます / 来ます", "meaning_en": "go/come in order to (purpose)", "example_jp": None, "example_en": None, "category": "reason_purpose"},

    # conditionals
    {"pattern": "~と", "meaning_en": "if/when (natural consequence)", "example_jp": "春になると、暖かくなります", "example_en": "When spring comes, it gets warm", "category": "conditionals"},
    {"pattern": "Vたら", "meaning_en": "if/when (conditional); appears mostly at N4 but sometimes tested passively at N5", "example_jp": None, "example_en": None, "category": "conditionals"},

    # question_indefinite
    {"pattern": "何か", "meaning_en": "something", "example_jp": None, "example_en": None, "category": "question_indefinite"},
    {"pattern": "誰か", "meaning_en": "someone", "example_jp": None, "example_en": None, "category": "question_indefinite"},
    {"pattern": "どこか", "meaning_en": "somewhere", "example_jp": None, "example_en": None, "category": "question_indefinite"},
    {"pattern": "何も + negative", "meaning_en": "nothing", "example_jp": None, "example_en": None, "category": "question_indefinite"},
    {"pattern": "誰も + negative", "meaning_en": "no one", "example_jp": None, "example_en": None, "category": "question_indefinite"},
    {"pattern": "どこへも + negative", "meaning_en": "nowhere", "example_jp": None, "example_en": None, "category": "question_indefinite"},

    # counters
    {"pattern": "〜人 (にん)", "meaning_en": "counting people (一人 ひとり, 二人 ふたり, then 三人 さんにん…)", "example_jp": None, "example_en": None, "category": "counters"},
    {"pattern": "〜つ", "meaning_en": "general counter for things (一つ, 二つ…)", "example_jp": None, "example_en": None, "category": "counters"},
    {"pattern": "〜個 (こ)", "meaning_en": "small objects", "example_jp": None, "example_en": None, "category": "counters"},
    {"pattern": "〜枚 (まい)", "meaning_en": "flat objects (paper, tickets)", "example_jp": None, "example_en": None, "category": "counters"},
    {"pattern": "〜本 (ほん)", "meaning_en": "long cylindrical objects", "example_jp": None, "example_en": None, "category": "counters"},
    {"pattern": "〜匹 (ひき)", "meaning_en": "small animals", "example_jp": None, "example_en": None, "category": "counters"},
    {"pattern": "〜歳 (さい)", "meaning_en": "age", "example_jp": None, "example_en": None, "category": "counters"},
    {"pattern": "〜回 (かい)", "meaning_en": "number of times", "example_jp": None, "example_en": None, "category": "counters"},
    {"pattern": "〜階 (かい)", "meaning_en": "floor of a building", "example_jp": None, "example_en": None, "category": "counters"},

    # time_expressions
    {"pattern": "~間 (かん)", "meaning_en": "duration", "example_jp": "一時間", "example_en": "for 1 hour", "category": "time_expressions"},
    {"pattern": "~時間目", "meaning_en": "the Nth period/hour", "example_jp": None, "example_en": None, "category": "time_expressions"},
    {"pattern": "もう + affirmative", "meaning_en": "already", "example_jp": None, "example_en": None, "category": "time_expressions"},
    {"pattern": "まだ + negative", "meaning_en": "not yet", "example_jp": None, "example_en": None, "category": "time_expressions"},

    # other_patterns
    {"pattern": "~でしょう", "meaning_en": "probably (light conjecture)", "example_jp": None, "example_en": None, "category": "other_patterns"},
    {"pattern": "~んです / のです", "meaning_en": "explanatory tone (casual/formal); appears in listening more than grammar section", "example_jp": None, "example_en": None, "category": "other_patterns"},
    {"pattern": "~ましょうか", "meaning_en": "shall I...?", "example_jp": None, "example_en": None, "category": "other_patterns"},
    {"pattern": "~てもいいですか", "meaning_en": "may I...?", "example_jp": None, "example_en": None, "category": "other_patterns"},
    {"pattern": "~なくてもいいです", "meaning_en": "don't have to do", "example_jp": None, "example_en": None, "category": "other_patterns"},
    {"pattern": "~なければなりません", "meaning_en": "must do (borderline N5/N4 but commonly included in N5 prep material)", "example_jp": None, "example_en": None, "category": "other_patterns"},
]