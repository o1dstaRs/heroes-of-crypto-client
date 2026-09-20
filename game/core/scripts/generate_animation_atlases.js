// scripts/generate_animation_atlases.js
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Approved animation art that must never be silently replaced by an older export. The Scavenger
// walk uses the user-approved original eight-frame loop. Keep that selected version through
// later image-generation passes instead of restoring the older six-pose gait.
const PINNED_ATLAS_SHA256 = Object.freeze({
    "troll_lab_cast_atlas.webp": "7d547bc8b771a90fa9a46d0cdfe40616eacbe019af794087ed79ea9afa1b9471",
    "troll_lab_cast_atlas_quarter.webp": "4b1f5e14cf58b6b0c5dc6357d47727965fdbbcfdb4fb9b81bd7e5ba72912a6b1",
    "battle_mage_lab_cast_atlas.webp": "3618ba31761ebb608e3f271d37d3fc210f60b38aa52c333f305c0bf9fa94dbe7",
    "battle_mage_lab_cast_atlas_quarter.webp": "a20f002edb86b07855b7a8a77a496cead4bcd123265a441d26dfa066cc078d97",

    "battle_mage_lab_melee_attack_atlas.webp": "c1548f45fdb82b98c3c351ef51d260320c9cf892f5f60978d08a58a6619bec6d",
    "battle_mage_lab_melee_attack_atlas_quarter.webp":
        "28b6af402db76084c246cb2e6f6a1468b642b147da82d1d60df8291a03fc79a2",
    "battle_mage_lab_melee_attack_up_atlas.webp": "cbf0984f4ddc962941e4502f1c1f1440c9b41a7d9d203d7a14510be330036ebc",
    "battle_mage_lab_melee_attack_up_atlas_quarter.webp":
        "97fd89e82a0e5c0b72fc02332daf6078c41d815eef56f96ba5006d3158b76c79",
    "battle_mage_lab_melee_attack_down_atlas.webp": "d6557373c108e13682ea90e368e56519eaa48766af5421bf38310125a6c85035",
    "battle_mage_lab_melee_attack_down_atlas_quarter.webp":
        "e3f2f778b983dc549606fa4975946e09936950f5c8a1db9232a742b7e1a1640e",

    "troll_lab_melee_attack_atlas_quarter.webp": "ce919aa12d663a31b91c03df970f7be06421e8629ff1e65eb8105ef5b8e6a7cd",
    "troll_lab_melee_attack_atlas.webp": "cbd0d4164244f5a28f868821870e15e670f377651b7b534f3c4fc72924078156",
    "troll_lab_melee_attack_up_atlas.webp": "4a5e1c76ae37dcd6a663a41694fcf4bbcab4c1bbdb09e86c36a5a112b68ca3db",
    "troll_lab_melee_attack_up_atlas_quarter.webp": "d0b4b6a2ecfa94e63819f6c0ceb62f80801df90c210b470c3edba2dc6f550a3d",
    "troll_lab_melee_attack_down_atlas.webp": "7b6093b552248a1d6700dc62056f303a77c03b49676f5d404b5b0c49d6ba885e",
    "troll_lab_melee_attack_down_atlas_quarter.webp":
        "04a43fa4c8148f11eda1a71339f57eea422450b08f386cc1550d2e07f7a0154a",
    "healer_lab_cast_atlas.webp": "4f27d3dc938e3db0a15e860fc2178c6193507d2e69ea52776d4cc928d69726a3",
    "healer_lab_cast_atlas_quarter.webp": "1479151c64f5eab93ed4726191624bc71bb6d44e3c6641e6c608bc781330ddae",
    "manticore_lab_melee_attack_atlas.webp": "276c1f18b5e7a5adbc50b73c5de7b016e8dabc58f25e8c0a0d7d7f4c1000f407",
    "manticore_lab_melee_attack_atlas_quarter.webp": "359733d7bf8881d818ff7ddb62bffd19afcfae4e274e58cbaf311c64aa51abb6",
    "manticore_lab_melee_attack_up_atlas_quarter.webp":
        "0f1e21679d02b293feae3fe68ae22aae0dcb263ab0f977026e0b178d393cc527",
    "manticore_lab_melee_attack_up_atlas.webp": "fd3a83c4351248ddb7622697d7eb61bfb31b4e00487f6a9e600e450dafd2817f",
    "manticore_lab_melee_attack_down_atlas.webp": "8b4df5487d07d6d53ac6c7ba4f6b5970f78ced57d1ff6dc4a03850e6735454e2",
    "manticore_lab_melee_attack_down_atlas_quarter.webp":
        "3d6dd19a5658b9fb1a86821e77be6737adc9d6ebaf8d4243c1107da27cc99445",
    "valkyrie_lab_current_cast_atlas.webp": "488a91a13a855b52a3c89be43dae764b627bc133a31a2a991c3fcdb6bdbd7750",
    "valkyrie_lab_current_cast_atlas_quarter.webp": "50dc478c19c42b2b5e361dfb240a0a69f2e65561b0ef2dbde2c239d9851e8717",
    "white_tiger_lab_melee_attack_atlas.webp": "2d370930964a571494a4fa189800c480726744582794bafc94fa8900c878a0d4",
    "white_tiger_lab_melee_attack_atlas_quarter.webp":
        "92dae916556dc14f37d2190261b0e02b2191515d1c4999d50dae7746a6638a1d",
    "white_tiger_lab_melee_attack_up_atlas.webp": "980be0cd0808ccabcdb435a89da3853a18b8e1e97a4f681fc8689ed14a7e020c",
    "white_tiger_lab_melee_attack_up_atlas_quarter.webp":
        "f4499cb44efcf01702bf5012937adb0aabd660c64f13a90697ee941187b756a5",
    "white_tiger_lab_melee_attack_down_atlas.webp": "9da45ef479899ca3101df33f6157409cefdbfa9d69c01f138052727bf9b13488",
    "white_tiger_lab_melee_attack_down_atlas_quarter.webp":
        "028ed3d34acdb4f93435ad47ef49fb9ceadee3f11891da58a412d1834002b347",
    "healer_lab_attack_atlas_quarter.webp": "809555ea93824b4b0e3ed3a1b09b07da023aa19cba842808191d9f33e2819089",
    "healer_lab_attack_atlas.webp": "55768adf3e59288266500d10ffbc64b84374316218afbe191af64d03d46114ad",
    "healer_lab_attack_up_atlas.webp": "6f5db9cd4c3d44b33e08003060075470d53298a918354d03bf84fe444f8c03d8",
    "healer_lab_attack_up_atlas_quarter.webp": "c0b813ff4e46d658ada9af80a723c5bf42953ab6daf6f82214ed1b711b6da066",
    "healer_lab_attack_down_atlas.webp": "040f127dde595873aff81fc4fa3105f4469e681611396f4be2334a2ff4f02900",
    "healer_lab_attack_down_atlas_quarter.webp": "c932dc2170a974a759d6a202b808f038b0dec7ab69415ba326b0082f0f13317d",
    "white_tiger_lab_hit_atlas.webp": "2a0600173d95fd3ce08653b94b851ae556f00250b1246d5af97dc57f0f11696a",
    "white_tiger_lab_hit_atlas_quarter.webp": "a768e88aea60e1c66dd205185e57bb0260bb2325dd802f5ad810cfcc09b927f6",
    "white_tiger_lab_death_atlas.webp": "6b6b148e6551e026b4dbf3cd062c8dba1b6dbfaa140c16160e1670c50e79552e",
    "white_tiger_lab_death_atlas_quarter.webp": "0183bcb84d05543f0660de6ee7f19193b96115dfdd37237101383dae53ac8ffe",
    "valkyrie_lab_current_melee_attack_atlas.webp": "87f82fc41b6443d4fd188127047e7b88a9d2f881bf58482950ddbf55c1cf16be",
    "valkyrie_lab_current_melee_attack_atlas_quarter.webp":
        "7f3f536df1236980af803b2d60391fc3b9657028af5d4e65430ccab4f6a350ab",
    "valkyrie_lab_current_melee_attack_up_atlas.webp":
        "9469a509c7d43d580b9eebd5d28d6e47f8b72348787eb878ae8885faf8dd8285",
    "valkyrie_lab_current_melee_attack_up_atlas_quarter.webp":
        "a638e6562a5f8de8f5b80470c22cc9a4dc796bc5fcd1330023a6d480dc58e0df",
    "valkyrie_lab_current_melee_attack_down_atlas.webp":
        "fc863f150d6c11f98bfe75f2106345e52a2f8ee757fa3b5a10f1936ea38f5c23",
    "valkyrie_lab_current_melee_attack_down_atlas_quarter.webp":
        "56ce8feb497246a5f53949a7c0a07e4c1d688d8750ae99b78d5878fe12411e85",
    "manticore_lab_death_atlas_quarter.webp": "b9deb354f8aadb57320f8b21deb5629fa5dae32f57a5c27ac0e8ccb8c3fcc873",
    "manticore_lab_death_atlas.webp": "a13db7476bc41d0a2bc8c76ab1df6a64c3e15e4e26bbec0bd84dcf1489bae579",
    "manticore_lab_hit_atlas.webp": "b94217da3e5616a85f78f4a9082cc488ca14a656e84c621332f7ae02ecef6c0b",
    "manticore_lab_hit_atlas_quarter.webp": "69badb5d7f261e69261dfc00304e9f4c3185b5b15f68ebd09474df0941b3d7a6",

    "troll_lab_hit_atlas_quarter.webp": "c446735dc189b7093fcef6550f0822b166f34fcb844616e1ab2740496f95be3c",
    "troll_lab_hit_atlas.webp": "c87864f63cef9df3bb0b708c9aec8dc56a4c4db3c22d9ac94df56ebe93c52b22",
    "troll_lab_death_atlas.webp": "48fe8bd5134beb34f0a85d6e04a60513cd6cda169f9863dedfa5900be24be402",
    "troll_lab_death_atlas_quarter.webp": "b9835e3a70854f971ebaac34bee426df2ffd3d617084d18c6436a4f1609cb340",
    "valkyrie_lab_current_hit_atlas.webp": "cb270801ea10b47744f3a68c9274e0133e9ce81395c0ed05bafbc13f81164d61",
    "valkyrie_lab_current_hit_atlas_quarter.webp": "4122a45efe3d05a32288eb19610486300ad87b23da7b8a65c2b67bd5ae978107",
    "valkyrie_lab_current_death_atlas.webp": "ccb0e4156a2df3c8167d0d20f1c831aeeddb16029e05cc4c93258a564116f661",
    "valkyrie_lab_current_death_atlas_quarter.webp": "d0566ee8c660ac0bafe774cab2b0b0f1baf6ae5a941bdb8a64b8625011d18e18",
    "manticore_lab_walk_atlas.webp": "d7088e19ee767177d36d0e25a601efbee89c434417dd245ec5ff654079692294",
    "manticore_lab_walk_atlas_quarter.webp": "a382238a53c1b25150468ca058edb75fa082b31f09d76739fbf6a0901b51d75e",
    "valkyrie_lab_current_walk_atlas.webp": "aa889b4cbd044d0deda1f4b1113a5eb9c2c9b1da6db537e95bdfa1672a46ea66",
    "valkyrie_lab_current_walk_atlas_quarter.webp": "99738479f3ed9317d14a5d7d926be4f5c8f20157cb366fa26f78b70a65f7cbbd",
    "white_tiger_lab_idle_atlas.webp": "1c85a65a0a6a648d2c17a56e740a9b8e85c3a6d52e30172f93b3a6ac046cf94f",
    "white_tiger_lab_idle_atlas_quarter.webp": "28803e3c3ba3ca177f3af6adc06337f26cc4261a07dd004749caa9bf06bc8794",
    "elf_lab_idle_atlas.webp": "fdf18f481b9ab2bbcf21b7c9d6fc286d5e4acd12293a4290440784a4cfc1cd00",
    "elf_lab_idle_atlas_quarter.webp": "887c34d10e79d76244839b137775a1b5256b194049ae1215b2a65f6423c59fb2",
    "troll_lab_idle_atlas.webp": "5a0d466e081a649354e7e4bf027f7ddc3967064b49c0c04ba131e01735a379a9",
    "troll_lab_idle_atlas_quarter.webp": "3e09dd6de40a13dd4f7300ef3d6b0c11928453b5249b9cf560e27b133101226e",
    "healer_lab_idle_atlas.webp": "e980636dec6a08d162f0a91db6021415642edcd36154ca0f4677113c9a4f30d8",
    "healer_lab_idle_atlas_quarter.webp": "f3eb689dc92735975a0f2ed89a07b43af5818d3b89c5d66924a578c0316cd234",
    "healer_lab_hit_atlas.webp": "774e827331cb0f4fc1243adba42bc234c089aa55caad05d672ebf37759a8d4ef",
    "healer_lab_hit_atlas_quarter.webp": "7865cea8c16e7db2ac70407b4ae170b590d2eeb077a21bdd85732ed68590b0d0",
    "healer_lab_death_atlas.webp": "2c47dbce8253d19d320d8437ab93bfc902976fd2da4eaeedcac0a847ada3b4fb",
    "healer_lab_death_atlas_quarter.webp": "87803f3d4b2832e2730617a1cef698c6a6b2c8d8cb9c3db4e42513bf2354da78",
    "white_tiger_lab_walk_atlas.webp": "f234f59013a5b507272cb2532f0ac8743b5be93715bea6eab3349d10bf0c2347",
    "white_tiger_lab_walk_atlas_quarter.webp": "e834609a9ac88a88fcf5d42f375ace4499eed2d3e0e8cebd166947694ac09a78",
    "valkyrie_lab_walk_atlas.webp": "aa889b4cbd044d0deda1f4b1113a5eb9c2c9b1da6db537e95bdfa1672a46ea66",
    "valkyrie_lab_walk_atlas_quarter.webp": "99738479f3ed9317d14a5d7d926be4f5c8f20157cb366fa26f78b70a65f7cbbd",
    "elf_lab_walk_atlas.webp": "ec60ed75fdef59c368173741d5f870bcff58ea09a2f1f2d14ece26889afdf589",
    "elf_lab_walk_atlas_quarter.webp": "9773992c2e965c20f310ea294f270d214d8ba107e27868ae0093f2615b3c31bf",
    "elf_lab_melee_attack_atlas.webp": "7044829c1e7c92db4312c719ce9693339f0e2eca241179e0d5c0f9548023533d",
    "elf_lab_melee_attack_atlas_quarter.webp": "ed2585e83019f92a9bb2687f5ce749400911af7fc6d4001cfe8e05407bdf771e",
    "elf_lab_melee_attack_up_atlas_quarter.webp": "13ee8b1862b2b9dcfc8216ae11bc3e0bdd641192981b97df94f7ea61b656226c",
    "elf_lab_melee_attack_up_atlas.webp": "09f4ee07a1a1d0354ed18b396ef160b479a7964c44918085786b93e1665c6833",
    "elf_lab_melee_attack_down_atlas_quarter.webp": "567546da07ca1a1aaf55568d58a143235431ecc9bd7c3fbfc154f879a4197618",
    "elf_lab_melee_attack_down_atlas.webp": "6a631e3fadf2ed562c944e852eb902a109b06957b6bc3bf9fe9a144fd672cdb7",
    "elf_lab_attack_atlas.webp": "50b73e69e2ab4da38ca6f7321d0d5a2483be46fd0f98171c7739ef1b2b7c4725",
    "elf_lab_attack_atlas_quarter.webp": "a483202c1c14edd47d6b209df8b76ea3d69748dfe587415952fa7e9f5a46211b",
    "elf_lab_attack_up_atlas.webp": "b63cda0773dbaf68357e81e67054cb902fcbb8bcb04525846f3599c923e4c77c",
    "elf_lab_attack_up_atlas_quarter.webp": "a6cea7f3bb8fcff361b1c0cbea601ae2a64635a07e1f749f82b4b0b9ab2b3642",
    "elf_lab_attack_down_atlas_quarter.webp": "c5453f78c7e77425aa0ec05043979ab9c256e8c86419a738e96e09240f2b1897",
    "elf_lab_attack_down_atlas.webp": "9b555e33cd4a37b2c46799ac5b95050e042691c9a0b819d5693fd6121e13a8eb",
    "elf_lab_hit_atlas.webp": "aabcca00d93e3d816a7802d12658d79d7752ea617cb46f520af63120c5c35a71",
    "elf_lab_hit_atlas_quarter.webp": "7868aed222de96d0726b7a48f7273edc1bbf3c1f60abbb3003da28ef974d8047",
    "elf_lab_death_atlas.webp": "f792c7172ec28c2d1b6e09ae5061abd5752f37ca155dcde15a007c8a3e20f4d2",
    "elf_lab_death_atlas_quarter.webp": "57be108292e0c8971443108b01e4eb17e67cd5e13ac88b8ae8178b8a84b1da51",
    "troll_lab_walk_atlas.webp": "3a9d9b43799dda246f3c8f01c0e1a02b28f547ae2f37c28d5568af76be9480c3",
    "troll_lab_walk_atlas_quarter.webp": "bda53f203b2b2c2eb95c5f6eced2f62c75bfafecce6d3bb47a09050709bb7d23",
    "battle_mage_lab_walk_atlas.webp": "b83d6aef2cda5d9fbf1003a463ffe4ed10d56f30db8b6fc4afae9898baf82dc4",
    "battle_mage_lab_walk_atlas_quarter.webp": "c15a3d781c860b4e266dbcf4da3d4b841c6dc41654c564625ff1a524cf089fa0",
    "battle_mage_lab_hit_atlas.webp": "9819d28bdee44c8dc1dcfc5ed6b7ae4d89e399366b540213c9668dc72661ba92",
    "battle_mage_lab_hit_atlas_quarter.webp": "1c2521a8bca03e31367c6524fc37ec586814e4a93efacf722046b90cd7251e8b",
    "battle_mage_lab_death_atlas.webp": "2a7edb04f142def09bdc735f0420e088b7251095391307b30c68d9d7dfbcd4d0",
    "battle_mage_lab_death_atlas_quarter.webp": "b84dca72b81f2dce0479a45930d2d61d7e7c7e9d720041f967a432c66af2426e",
    "pikeman_walk_atlas.webp": "00e26fa2181fce33c00449816e3333b0702e931471ccec5c8fef21eba22e9624",
    "pikeman_walk_atlas_quarter.webp": "f3aebfadbcac3f1459e0f937edc7257437f5217fec9003f6ecec87eb196f5c12",
    "pikeman_lab_idle_atlas.webp": "7f9433a678062e048cb45beddacd9d11fe6c9cea32274a20fa9417885fda6ed5",
    "pikeman_lab_idle_atlas_quarter.webp": "52c4011844d693b343827e2e4791abd4bf10e8795190d938c52565c41b58da57",
    "pikeman_lab_hit_atlas.webp": "4a9be94160a546a564a2a62ef5bf5d3a3be1c4ca10d01d4aaeeb29d5f81c105a",
    "pikeman_lab_hit_atlas_quarter.webp": "75177a68d8e0620adf0cda63f08a3214ff3ef9254dd4f640643b864f9275f4b8",
    "pikeman_lab_death_atlas.webp": "bca1ea3603f4216a1cf0feaebd057a4c066e30813fe05224c2c58637ad9809ec",
    "pikeman_lab_death_atlas_quarter.webp": "0ffa74f6f1d5fd1f2993e8c01b6da25428f7faa4e86b9a5ae7323a252e8477a5",
    "pikeman_lab_attack_atlas.webp": "f16a04e070b24e86899021ad026aa571d9bf9dfdf7cffa0702cff25a25618520",
    "pikeman_lab_attack_atlas_quarter.webp": "08f1d79c1cedf2817fbaf8d325173d159baef7369bfb9e1f581545e531e9261e",
    "pikeman_lab_attack_up_atlas.webp": "d88bc34cbd4718f8f4fef89fbec241474b67f008eff3e5a0445c01db5c4f6180",
    "pikeman_lab_attack_up_atlas_quarter.webp": "ccd7639cba9a755947e2c11334f367191966711ed23d9d7571e7591f1be88b94",
    "pikeman_lab_attack_down_atlas.webp": "f2036ad189ca8426377949212d6201001d88382916ed0771bd71744149601fe9",
    "pikeman_lab_attack_down_atlas_quarter.webp": "3d4fe7c864208a9b4bce9daa56be3cdaf9a18d1bf2b6fedc01dfb4a9dc9af192",
    "dryad_lab_attack_down_atlas_quarter.webp": "65129fe8c92a7307922f60e948003fb98d0935572f25c42a3abc49d050b931e7",
    "dryad_lab_attack_down_atlas.webp": "25ea4e449c3f1c54bf601df41d2b3728991b9cafaa4a37eb41d4cf3b9ef54c72",
    "dryad_lab_attack_up_atlas_quarter.webp": "0377ca96abcd01df92b66eff243beaf79d42cb590517c4479087a9bb3643a21e",
    "dryad_lab_attack_up_atlas.webp": "a57804910eb8d979b34c06567749b4c98153458bbe3b75a2ab75c4b5cf353dbf",
    "dryad_lab_attack_atlas_quarter.webp": "34cc87c618f49332559adb5b86e5e8f4ac6f005c78993ac9e0caa0a18639a1f0",
    "dryad_lab_attack_atlas.webp": "286d0f602fa0d4f307ff12b3067edd3318c24cfc154639b69b68c97f490860dd",
    "dryad_lab_melee_attack_down_atlas_quarter.webp":
        "ddf41eafa70b7f68d9d19fa82470aadbcca91c2094368ab93f4dcf2ffc5370f9",
    "dryad_lab_melee_attack_down_atlas.webp": "fc09ec68736907531672f29dae0109acaa9d1085545f18f8d740d96f06989d89",
    "dryad_lab_melee_attack_up_atlas_quarter.webp": "9f68d60290fb260c14dbb986fe26fed937af73bbadea832a9507ab6b06a244e7",
    "dryad_lab_melee_attack_up_atlas.webp": "386c716b3dc78b9379cdd0891678bed52a622566168480b668e08c0e21f0cd2f",
    "dryad_lab_melee_attack_atlas_quarter.webp": "71dd46402b423e7f80165f36a817e90e40bffb28488be9581439476d2c8ea9a9",
    "dryad_lab_melee_attack_atlas.webp": "096e3d3fd63fdad6ad05dd19983c5f464e564503448464199d46a91930ca2f04",
    "wolf_attack_atlas.webp": "bccc7158b1c9441503f9fe9af63830897e9948ad617e444dc0b73a65b9a1af52",
    "wolf_attack_atlas_half.webp": "527e21db8b79abe6cfd27677b2ef9a04b37492d9e93e4d7893d3104817e2a16f",
    "wolf_attack_atlas_quarter.webp": "72dbc09829ed397cf10de5ff509d3391e48eba1f6ffaec3d35d4133864eb92eb",
    "wolf_attack_up_atlas.webp": "3edc15b1588150af228cb5e1491bc64bc55486680f745c2d8f3df1f6050f76a9",
    "wolf_attack_up_atlas_half.webp": "2dfdeeb580e7dbd095c9a3fca58367205c77e93995a350223a2ddd433ffec68f",
    "wolf_attack_up_atlas_quarter.webp": "2a4aeb7b3a863814632701cc9d9a9ab2e9965437e0043193056884c6fc7d4387",
    "wolf_attack_down_atlas.webp": "1491ff45f9f4f7764eba2c58d6d0eef200dc1d16944b9cf5ca6866ee152fc878",
    "wolf_attack_down_atlas_half.webp": "2f7cae8c7b8507e57b8735946783686937b67bf24de39353b2ab5e334f125de0",
    "wolf_attack_down_atlas_quarter.webp": "7c914a2a710919c5f1929ad3f7ab4481d97f4666eecd8a72a6ed7363c2304208",
    "centaur_lab_hit_atlas.webp": "510b6192216f8da14b80192ab8a7db448e0f115e5f3939578e543f1b70caf743",
    "centaur_lab_hit_atlas_quarter.webp": "3d1e2fdc36898c57a8f52b5b04df10cd9245e824c89170249ca0f261f86fd2ae",
    "centaur_lab_death_atlas.webp": "4a992ee85d3740ae4fbf8113898e092897de8f6e529831ca3dda3510c6b3f29d",
    "centaur_lab_death_atlas_quarter.webp": "448a15231031e18bdc9eaac81b6c6088e810506b304bb823bf834890d973f25a",
    "centaur_lab_attack_atlas.webp": "1bebeda7766040c3c85d5a16cd32b2f2247ee5ce4c839ffcffd4aa24c6fcebf7",
    "centaur_lab_attack_atlas_quarter.webp": "fa49101e2bc73a17faf5c354f21aee781a08ae4d84c95f27c2949378bb6d2bb8",
    "centaur_lab_attack_up_atlas.webp": "7f51d6e1a0d9c498f96f5962a5256c75aa34efa4ca3a90992556cfdd0a49a644",
    "centaur_lab_attack_up_atlas_quarter.webp": "4aa377a629746350c1bfb0d0019f44bb526ccaf37f352e341b228b1451bd10a9",
    "centaur_lab_attack_down_atlas.webp": "b56c5ae6d5059160eb459f514778818178fbce274b1d292db079eb13988b962c",
    "centaur_lab_attack_down_atlas_quarter.webp": "689460119e0496f88f4e337df8a65935d28908bb2c6b31b439a7e9c4697c3093",
    "centaur_lab_melee_attack_atlas.webp": "ed9c546cf00f14119f350836b4629787b1fa7c527eb9229c393fe3cb9b9b891b",
    "centaur_lab_melee_attack_atlas_quarter.webp": "e7113cd3d2573ac694c62ff9a24ae1926408e2e7d81150f89cd9df75eb70240b",
    "centaur_lab_melee_attack_up_atlas.webp": "7f60a1f9a84cd6d47b3a995da93c8a16673e25f8a7cfc56ae1a551579e8578ee",
    "centaur_lab_melee_attack_up_atlas_quarter.webp":
        "02c977577aa8f493be2b76f060d8ded5c10fc7c43387b2dbbb1580a83d2e0120",
    "centaur_lab_melee_attack_down_atlas.webp": "af1f7f928d2272cf2d500b5e5de569a6ea3e3cd5f0fd027baee86daf8195b38c",
    "centaur_lab_melee_attack_down_atlas_quarter.webp":
        "895680a143d50f73df40ac7615d2e2177f7de1783f38a058c29f3bc77476f8b2",
    "dryad_lab_hit_atlas.webp": "83920ede9bad05a88c6adb5e12c6c25f8d36a9254bf38ee584581e1e417f6f10",
    "dryad_lab_hit_atlas_quarter.webp": "ae2542763bc6ab005d507fcb51ad9d94c6f621d154ae3f75476ba9771a6e1311",
    "dryad_lab_death_atlas_quarter.webp": "6132553e57c9c14a2a04cc6c49a721b1c88aa819da24ee3df605cb26f72fe8f4",
    "dryad_lab_death_atlas.webp": "05fbc059448efe957c712c403387aadc24f3ed72cfc4b47d267e194b42a346da",
    "mermaid_melee_attack_down_atlas_quarter.webp": "412020d73fbef63f614ab9755e6606d84589f1468c4bf85e1d2d08feb7e6eda1",
    "mermaid_melee_attack_down_atlas.webp": "a81ecfbfad9f8b9c82063e7119cd7749b00a47c7a5df033a293260820f40b1fd",
    "mermaid_melee_attack_up_atlas_quarter.webp": "8bdc40eecfc27a56eb8b751958a0fc30f4b2dbd899e0e4535af1fd83d87f2241",
    "mermaid_melee_attack_up_atlas.webp": "03888fe1420ab84ab7c06e297f3d790af06f77b25e9f6da46906a59a4bfc4102",
    "mermaid_melee_attack_atlas_quarter.webp": "45bffc1e1a457612dccec60c8daa193408ffb4d82bdcd1c44c7c27bd00980515",
    "mermaid_melee_attack_atlas.webp": "68e259550916c29be4c33bef6c3a3bb0151b81662822f36edf49cfba8a38a9b1",
    "blacksmith_cast_atlas.webp": "4a3c85354608f872c421a30c3f6a543a5ceae77119a56212b558e56ee8050e26",
    "blacksmith_cast_atlas_quarter.webp": "e5157f31c6bdf2eca632e19842c28e17ee71a4c05c0ed54f5161e57d74febbfe",
    "wolf_hit_atlas.webp": "5a2d2fba09e81c29983591be26bdc6617a053957b2ebd4d5849b29faa59042f7",
    "wolf_hit_atlas_half.webp": "32cf8eb89d120158dfccf546dc66fa00be8cfea9d4b036d6d9745e4c696fedcf",
    "wolf_hit_atlas_quarter.webp": "bdbb5f1a1f009d9d1fae4ece887f1a6188c66e49e1af657fd903fe2c647ac5c1",
    "wolf_death_atlas.webp": "b00ba9db38f0d524c0f013446613cf0abb8aeee673668ff9465178199af88b41",
    "wolf_death_atlas_half.webp": "9d20bb7cc7b318f58cd72cdef883eb99c7db6fa83cf99713927b51758500acc5",
    "wolf_death_atlas_quarter.webp": "59a28fd4a5496c7912e6c44d7e7d1f30072eb93895fa668996ac240afcfaa32b",
    "ash_moth_cast_atlas_quarter.webp": "335fcce6ae6d6d7b2ed18b03349409b8794176de73bc29e442359b4c2609f1e2",
    "ash_moth_cast_atlas.webp": "8d4f92a608a4a12d32987cce7bb27fec6bbf33cd4b21c5732fbd15c052218d05",
    "mermaid_death_atlas_quarter.webp": "51f9b375403dd4dfbf7cb71f7c59c05c83032621e1e5355b8ba469fa7bd468a1",
    "mermaid_death_atlas.webp": "6a4e77e6a1df29b960887bd95ab44129903d68603325f8e8f010d8270fb5d217",
    "mermaid_hit_atlas_quarter.webp": "4332e5a6e2394e3303a5bcb2686eceee05c2a6abf6bda2ca12fc9be6dba3e96f",
    "mermaid_hit_atlas.webp": "a912a965f66fe2f6b14a4ce45a0f0d3dfdd931e41fd1719218e7335823bef618",
    "dryad_lab_walk_atlas.webp": "d09c17c889c5c295084e1f5217b04927d8e5c302933cfbd5787db9da11556625",
    "dryad_lab_walk_atlas_quarter.webp": "927c2b4953a58ef7832e5ee9ab0bc9ce0de11f4f1a0c929107c2d427798390d6",
    "fairy_lab_walk_atlas.webp": "c6bbaa2a3409f8e7d7fabfbe948aba2cac1100e004e2acc84dcea5f3adc72d4d",
    "fairy_lab_idle_atlas.webp": "8e33c302cbb56729944d392f49dc6120f699cce80b9e951ac520a076da361081",
    "fairy_lab_melee_attack_atlas.webp": "73d5912fb5fcf239c7b2da602a53c86b83ef0ee8fa72f6dc5e79c90cdf16f245",
    "fairy_lab_melee_attack_atlas_quarter.webp": "8567d4c51ffca02c5ed83fe6155049eb4bfa185df6f991f07559c2013cd0e0f1",
    "fairy_lab_melee_attack_up_atlas.webp": "72e3a7f92f733176e3d319f9b75414c2fd9184c63c5548a38b60267b50539c15",
    "fairy_lab_melee_attack_up_atlas_quarter.webp": "9d1514af761eca6eaaab5b3e33162d81069acd0ae581c60a6ad7b81b6f663e99",
    "fairy_lab_melee_attack_down_atlas.webp": "d13a7dd6c14722b74fa4da4dd4f575e0a2ee5cf6091effff42569775d549b0ae",
    "fairy_lab_melee_attack_down_atlas_quarter.webp":
        "06448271984d7cb114b5bde0fc3b35a5b1a2f9b74019334920de012533b64328",
    "fairy_lab_hit_atlas.webp": "f947da6b292ab43f6aef6f39752ef7653f60b03a96a0d1d6718851fd0db582ef",
    "fairy_lab_hit_atlas_quarter.webp": "5755a43e888da37deeef8fa3bc20c5f561752c4c542f4f3b6c8106ba0123bfae",
    "fairy_lab_death_atlas.webp": "7fe93c41ca762157b3a57fe62637196d7d8a7a7d94d353b2cc1e87f8012a3734",
    "fairy_lab_death_atlas_quarter.webp": "865e51f0e7b30378c7cc9e581741fdaa833e1c87ead73acb71459fb3cb76c244",
    "fairy_lab_idle_atlas_quarter.webp": "5ff1a0384678a76e821dc9195dcc2897f09f5660a98ccd7e4e65e876a37629e0",
    "fairy_lab_walk_atlas_quarter.webp": "bb75424a516f2f8e7e668c42f092f4d9aed28af520dff06501c8ecea2b90f9e3",
    "blacksmith_melee_attack_atlas.webp": "ed7e1f5dc210b23289814292d6cd9979b6cd66e0f899e698e9b1b48e08dd81f0",
    "blacksmith_melee_attack_atlas_quarter.webp": "e4ca44fce20f943ff8633a4458315572bbe2dc11467f60d1211d3ae235eac964",
    "blacksmith_melee_attack_up_atlas.webp": "e2ac4703df6869f0152c0cce865deb6f72d61f8d4d21399a7c8f4a3829815fb0",
    "blacksmith_melee_attack_up_atlas_quarter.webp": "080cd14a9ecefe5010ef6e26201be377f8580e7a5a07c34ef6b0eb9dc465843c",
    "blacksmith_melee_attack_down_atlas.webp": "44c25859f3142a9208c903ae115825ad8e8d5ad725968422a912ab7b54fe927b",
    "blacksmith_melee_attack_down_atlas_quarter.webp":
        "744496144dae26d3313a425b1bc1448ccce7b349a6a7778ade531e37dfb0440c",
    "ash_moth_melee_attack_down_atlas_quarter.webp": "aca32f6557e06357a17aacec55fae5757f144a4840a9e5ef5e9f2a5bee9f263b",
    "ash_moth_melee_attack_down_atlas.webp": "f184bc6bd2b327be91968636726c73b4ccce24b4639be3777af824c458bb2774",
    "ash_moth_melee_attack_atlas_quarter.webp": "d4265ae820895b207e3549906412f0ddf4895ab6d2b60fe4c0fe72b8ce2cf814",
    "ash_moth_melee_attack_atlas.webp": "4d1f3b719d42dd77692805921d13a6031c63f9d4e2c6d5cb38e0322386caba9d",
    "ash_moth_melee_attack_up_atlas_quarter.webp": "3ae6293108dd15dc6573ec06981372a1fe86ae2b41edd378fbd51ac704a63a89",
    "ash_moth_melee_attack_up_atlas.webp": "b8d95d6093a954d7e6bbfe3eee676966040e3ca58b9370bc27984fcc9868ae81",
    "orc_attack_down_atlas_quarter.webp": "6e11962b255d1fe75221f44556ef2a01dd0c2a1dbf0e60e0b468034b44ba8a3f",
    "orc_attack_down_atlas.webp": "e9e0ca6fdf73f59ab57a9e4f67840aca627fbd64caed1fa734ad515fafe05f9f",
    "orc_attack_up_atlas.webp": "178de430af92d87d23f63b45217ed95498a5e79562b5ae43829ff625506871c8",
    "orc_attack_up_atlas_quarter.webp": "81505487bcc835d0b8418d9c47d8cc303db3ef98f75e9db1c050172a63345c20",
    "orc_attack_atlas_quarter.webp": "93e2d2c67cb8c8cf83ff8773c0bc967ed9416b0e07ea1bb3a5ef6fad87aed133",
    "orc_attack_atlas.webp": "17af0c42e53c2dfaca79232a9433f0accd165b562c2fe261da899cfe5750312d",
    "arbalester_idle_page_00_atlas.webp": "9caa94fdbed3b07332cab382dd03fb6b5b88ecfa1ece92f3a355063a1bff5770",
    "arbalester_idle_page_01_atlas.webp": "e500d455356c5e82002c327a846f41aab253edefbe17a5c8d84cfc3a1f3d1b8e",
    "arbalester_idle_page_02_atlas.webp": "11dea8fe4e3dd8638e437e63472db4663c669cddb9dbe2557b395c5cfaeadd91",
    "arbalester_idle_page_03_atlas.webp": "e7f26fd5facaceda9de8d92979210927db27acb41a243799c309342d3520d7d7",
    "arbalester_idle_page_04_atlas.webp": "b9a492de1fe3c1819d61f048005114d7c35ce3d1997e5b3ac9bd8ee5ee565d15",
    "arbalester_idle_page_05_atlas.webp": "291ed677799163d5c368ccc90140bc2f95a1561bc7e8fa4bb59fb09a858ded72",
    "arbalester_idle_page_06_atlas.webp": "baa53ee1edc0735144f8b2a2cf76b33937c1f203d655a70f940ebf2cc7564a46",
    "arbalester_idle_page_07_atlas.webp": "18713ae919c9626374502bbd6d9aea089747577f1995eb8ce210d3649889a8f6",
    "arbalester_idle_page_08_atlas.webp": "58de322afabc0f56c27b5fa8aee2333141de85337f31e3e664c2f836eb68cba2",
    "arbalester_idle_page_09_atlas.webp": "292ce923e327bdae346a4b3a3781ad314752c366106ae6a5dc414eb4143815c0",
    "arbalester_idle_page_10_atlas.webp": "d7bca95802e74b2f100aef539936efccc638c956383c9ea93a26e316e44248c9",
    "arbalester_idle_page_11_atlas.webp": "d59dff8268f5163327fa3d3ec7e2c0673e54d2b3a154be1758ecf5f2dbb4985c",
    "arbalester_idle_page_12_atlas.webp": "036823a1d89d37e217b6800e60b37f6c1fc95346d8928ce3ae700ff2ec370014",
    "arbalester_idle_page_13_atlas.webp": "fa4cac2fa643e58b5dc7efa40cfab4677bb2595de861dfd68b0ec675732aed47",
    "arbalester_idle_page_14_atlas.webp": "46e31c4dfe2333d3bf3f8d13c9e435aea7ce448f376dc30e29144c9697098928",
    "arbalester_idle_page_15_atlas.webp": "2820c1ff971521004a95bd3120f2589546c2c3e8eac0c9560b56f28210217bd2",
    "arbalester_idle_page_16_atlas.webp": "349546a3ad51938d2c366f2c8940f328e56624ab4a371b89dd6e0a3a44caa1a7",
    "arbalester_idle_page_17_atlas.webp": "6f20b5333402743995f1e652b6f544a5d840f8f5f036faeffde3e761541e900c",
    "arbalester_idle_page_18_atlas.webp": "4f34e9b320bc1571771461e8737ef5d88a8c37ad4d3d04a2bc558c35e0694247",
    "arbalester_idle_page_19_atlas.webp": "05dd10b2651272645e14b25b6b37a587678f423b252f921cfa511e0842b1a237",
    "arbalester_idle_page_20_atlas.webp": "7c52354afd2348dd2dbeb52c7cdf26dacdd513cf3eae0575c62fcca7185cef99",
    "arbalester_idle_page_21_atlas.webp": "593ffd10218bdb6fe8f79286db4b4f61ee45bdd42563cae73c9e069553c14ae7",
    "troglodyte_default_atlas_quarter.webp": "2ed1c4ca26a6f254b8b6498b445ebd7c7952452ffbbb8779babb3e4e0f54e8a0",
    "troglodyte_attack_down_atlas_quarter.webp": "cf708344cd9a05c208b06894506a9bce065a6f59df45a273d01d05b137427324",
    "troglodyte_attack_down_atlas.webp": "174d5dd039de2e7b214d37d4d6530750e664548a9df67fa4fa3b16870e9aebec",
    "troglodyte_attack_up_atlas_quarter.webp": "8eae1c5ae6c30299a2ae3fe577c64cec37dbd92f7d88ae10b277b82536da7140",
    "troglodyte_attack_up_atlas.webp": "f45aae98f0d2244721403b6f9862e2888729a432db9db2fe1fd087e0999a8863",
    "troglodyte_attack_atlas_quarter.webp": "5deb7ab4fe37f6a2e05af1ca295114e87d0ca47043e343f565c7d0218617c823",
    "troglodyte_attack_atlas.webp": "1f8a25ce58c62a905b5142cab08f13f0a2f89ed674a7f74c0d153b695c9833dc",
    "arbalester_hit_atlas.webp": "db37df2022ca2c0c7b6ecf43bf0e6804b7b58d135fabcbf4c2c899dc4455aaf8",
    "arbalester_hit_atlas_quarter.webp": "0d0c520f7f3aada273622e170f1f64cef236dc97add11c56700fb072366ff767",
    "arbalester_death_atlas.webp": "0b4bb527211c6a95b3be75a1fccb64883e384a59df323894897bd74f29559a95",
    "arbalester_death_atlas_quarter.webp": "e6fc778deea4f9c0af0c820620d874101998d2af0986f9d0df2bc34eb0574368",
    "mermaid_idle_atlas_quarter.webp": "dd2319e5b94a4ffc1d87b15f66ee477e8d65f96e44f4d0b5fa65f8d544dd7b30",
    "mermaid_idle_atlas.webp": "52011935a88865e73f9136767fe37a480dbf5d2225e48bcada39d2cc3cfcc587",
    "mermaid_walk_atlas.webp": "5a29bf204def0e7bea392117398715ca23cad7335bee1a6636def055ddcdaa72",
    "mermaid_walk_atlas_quarter.webp": "745b86b3338133b4dcd9489d9765b873e9a44d61078b46df226e3dc0d6d7cddb",
    "ash_moth_death_atlas_quarter.webp": "b496b639ee79b18067c9ec90dc5828966eb58acc9ddc80ca82814e8bccd6034c",
    "ash_moth_death_atlas.webp": "5fc90f29659aad1d443125ed4fd38c97bf4c2317e27895a44b4f305caf035ddd",
    "ash_moth_hit_atlas_quarter.webp": "02dc4bdf23040da52963bd4e74ea56f6acd40cae96d04e7bcae5e1de42095c66",
    "ash_moth_hit_atlas.webp": "b2eda4db1326f7984901efab8c964394ef69570eb83648ddfc6707e245f80a1a",
    "orc_melee_attack_down_atlas.webp": "3f9367992992b8e8f78a4fedbc360e3413c068daaaa70abb738470da0c74f03f",
    "orc_melee_attack_down_atlas_quarter.webp": "24018473a08223a9887182b9b11efaf5ff5e6cbe14625c5faa719b7c25470eee",
    "orc_melee_attack_up_atlas_quarter.webp": "b7305be15f36ae094033c8490d2d8af73be5862dac4c790c5a5876591d9cd795",
    "orc_melee_attack_up_atlas.webp": "10ee366b491b19324d2dd69297e84bf080b5a4efc76968b8fc8a7042bf50d8de",
    "orc_melee_attack_atlas.webp": "8f353bf0539b9b5fbc69f49e2c79871570c60ba98dd28b2f45c3c43921f93f43",
    "orc_melee_attack_atlas_quarter.webp": "b1f186db4a143dc199571bae63467a035acd6c6e2e96b920cb71c9c8565d8035",
    "orc_death_atlas.webp": "ebfe084377d863edcf6a409b4277107c1ff7687fd22c4615f627381ddbad7d7d",
    "orc_death_atlas_quarter.webp": "c3377772931f4ef89aebfa5d178df736b945f1403c5c205f4433238e80cd8f98",
    "orc_hit_atlas.webp": "09c9ff61fbc51a61d0f0b073fdc4f549a02a14623e67e21361cc01bb80fb0514",
    "orc_hit_atlas_quarter.webp": "a807897fbd58bd396db28392fb462d039013d3e5797ba8549926d89d5f0cff6b",
    "blacksmith_hit_atlas.webp": "86219bb5338108f9db2c97c8882ac731a4352c55cc364224dea62c9f278093aa",
    "blacksmith_hit_atlas_quarter.webp": "50d0897f181161016b424076d0fead24f62f8140358bfd34a3b055c5451047dc",
    "blacksmith_death_atlas.webp": "fa178985af92fbbc0d6988c9a40213cecb8f6d9cf1918856ab567c8587683677",
    "blacksmith_death_atlas_quarter.webp": "2ce923fe1b5471b68d6ceafd3abb7c6106cc1a028a8342e04225f956c7ee0c2e",
    "orc_idle_atlas.webp": "1221ba1c9bc4f7eaa69306b9b5fce6229195e5ef3d432818022875740ebf12f8",
    "orc_idle_atlas_quarter.webp": "b3a2acd8c4a1d59e867be4142154ccee78310f42ea6067213c2efdec521ce1f6",
    "orc_walk_atlas.webp": "d332e18efb68a38b999184e564d9a15b3e006cf806afecaeb2ca9bf856dba811",
    "orc_walk_atlas_quarter.webp": "0cd467e4b766c53ce70f5060f2e4e3018b82ef842bc1a78a881f71c12742f88f",
    "squire_attack_atlas.webp": "189d0179862ac03da348d6c48ec4ba60cdc449b6aa74c3de6d1619ad330b57c6",
    "squire_attack_atlas_quarter.webp": "52531bfdcc726ec57015b637619ff2f6da99607dbc0307bda4fcea119a074a2b",
    "squire_attack_up_atlas_quarter.webp": "5a7b53ca22ea066dbdc5b05fa18bc8b3ee10e8efa1b956f44eaccbf697652936",
    "squire_attack_up_atlas.webp": "9bb3072831b20bfcbe72d8c8e4c9d22fcd945972846978174bd21d3c3403ce2b",
    "squire_attack_down_atlas_quarter.webp": "3295605cd2078f43995f0b84655ca8aa9b8d96aaae27798ebc972e6152d2bee1",
    "squire_attack_down_atlas.webp": "fc41ce639cd92cc3a3441f8a56f8caa0178bc8880f59fcb39028a7869c18bbdc",
    // The display-size Troglodyte atlases include a final RGB-only edge cleanup after downsampling.
    "troglodyte_idle_atlas.webp": "f377d614a44b99fc01fafcfcaba6ee1bef2d9e900fec60005fe904d252bfb647",
    "troglodyte_idle_atlas_quarter.webp": "ecce7a40bb035d46cc0878e635a103d235e5220bd8c9eab0162d5ad594a1a080",
    "troglodyte_hit_atlas.webp": "506f7af7f98eb6fdb744a1e6cdcf981e1f1bca27d9df594913b6a18e9b28c0b7",
    "troglodyte_hit_atlas_quarter.webp": "3b630f9ca3f88d7859c75c4fc5e373b5366a812ba19d04866b64ee2cc50b8cb4",
    "troglodyte_death_atlas.webp": "5d4b47276ab17d1caeba8f78830dd7cf9223febf9758dfbdd56f40a066bc1568",
    "troglodyte_death_atlas_quarter.webp": "239d0260e36be30b61fad1cf8f885b21e1df68db21c186dc419d5b525501dae8",
    "ash_moth_idle_atlas.webp": "097df0fd4c762cad0f4e9945ba1b7a784957c61aefd692eccc95fc7eadcc7699",
    "ash_moth_idle_atlas_quarter.webp": "378ce5f55c7ff50061f55b97eb7d3b726b6bd706efb57899c693c21a9a0b6a56",
    "troglodyte_walk_atlas.webp": "8d87e86aa86c015a71a165fd0790ab9804c75dde7406dab63383a27b65a65f28",
    "troglodyte_walk_atlas_quarter.webp": "4c9e7cd0b0131d67b2d501c3a5e8ef676957b5f5864b2893c80611148df05ebf",
    "squire_hit_atlas.webp": "ae2043d7219b29a3b88a8469e12f02e2d05b6a9535703fade453096b4aeda794",
    "squire_hit_atlas_quarter.webp": "e6f95d61205d52a8a18718692d03ce9c23933c067e9c1149ccce99000320139c",
    "blacksmith_walk_atlas.webp": "30ff339797ecb6156bd9c3bbee21ddcab4f10875e9e19140a3c325e1368bbf36",
    "blacksmith_idle_atlas.webp": "a10e0c3c68021d4890477af80157418407d035dd82085cbf0e7724ccdb136fba",
    "blacksmith_idle_atlas_quarter.webp": "5be102e9941c64b8559c6bb4e0648f8b2424c8c846a57af86478522297689a31",
    "blacksmith_walk_atlas_quarter.webp": "7f7643c319115d989c55794757b9add8f8af1ce01233ea729c5744eb384f94ef",
    "arbalester_idle_atlas.webp": "0d1ac17571a56c80f6419da461d95a010a55b302719ecdae6ede7f4b524e6f81",
    "arbalester_idle_atlas_quarter.webp": "b1163e5159d31385d2eee95ebc09fd01fa3c1ba39d34ebf95231617cd10c1341",
    "arbalester_walk_atlas.webp": "0f710bb008f76b26d550e7ec20ffda7af593cfa248d6bbd16050a8a6a52d5a6c",
    "arbalester_walk_atlas_quarter.webp": "0b0163d72b92ec788c8fb7d34d1bb3205781f98918253c330de0065e68afe5bf",
    "arbalester_attack_atlas.webp": "9e810c3276a323c604bc3010b2f8742e8f016cb5d9a00202179dba9f1fbe13c4",
    "arbalester_attack_atlas_quarter.webp": "5ff676ce0844b851ce9b12ad9a17b4898ec5ddb247fac17cb6bb3f579c28db8a",
    "arbalester_attack_up_atlas.webp": "bf33780d407aa3f3cef29317e255cbd496c8875f2925471d6b451a32cf111d7c",
    "arbalester_attack_up_atlas_quarter.webp": "a4011476dbe69f1f8a33f8e8423fad12da639413092ebac87ce0e59245309925",
    "arbalester_attack_down_atlas.webp": "c627150e6fb3f54acd111a93fcf6356a22f0218a6e9522224be723570f1be100",
    "arbalester_attack_down_atlas_quarter.webp": "8cbd772f9f4f1e53068f7187c644b7bb02996e5b8722c23d7662168727728cfd",
    "arbalester_melee_attack_atlas.webp": "8779d3136e1123cb043930aec6a8f4bd1a3dd453fd98c9c3178010f00d17f516",
    "arbalester_melee_attack_atlas_quarter.webp": "7659a030f5f4915fe836692c44cb96245453f1583c6c50c46ed229083b05ac95",
    "arbalester_melee_attack_up_atlas.webp": "20228cf569d1c42cc73a4f308baf57d95cb2784d593e8ed796929f9fa1cddaa4",
    "arbalester_melee_attack_up_atlas_quarter.webp": "8a499184e8c0f0f7a2538f5a3f344436d5c51f5b96e5139b0b907d8b948c8e3e",
    "arbalester_melee_attack_down_atlas.webp": "63e5053dfd3647666c370e6516913c76f431a3f3a81fdc00449300c82350ce07",
    "arbalester_melee_attack_down_atlas_quarter.webp":
        "3b6abdebc64dffce39c9257b329d57363cbc342922a6c13e9efa2367ea79f180",
    "peasant_hit_atlas.webp": "a9b6e075473b3efbb8c631b14578992e7c7c59d4783fbeb7e4532560d77de5f2",
    "peasant_hit_atlas_quarter.webp": "1edaf0abe3dd89f82d9e5426315935eacabb718c2d7b36f74e196be48eaff71a",
    "squire_death_atlas.webp": "5473794426ccf536bcaf7b55417308c2f231dbd41bf357be14465c31af835878",
    "squire_death_atlas_quarter.webp": "b7f9bffde0ccb82d066bd83183999913863f4f3f647f8405873a2951a647f8c0",
    "squire_walk_atlas.webp": "c916b803fa2c5a51bc44cd6326c3be1c699540e4848dc2d2baaedca9a039eddb",
    "squire_walk_atlas_quarter.webp": "fcafc98678c26bfdf23b24555d141459b3301c5ac40e33f5229ac6ee35b4f571",
    "thief_walk_atlas.webp": "60bc33524b2aa7425776cb2c79cc6360126a35b54b0e9bc40c57cdfff17218a9",
    "thief_walk_atlas_quarter.webp": "7cc5d165eafbbe0a401e6bfa5a99ed35fef96d1d7abd0cdfd7663c83052d2f87",
    "medusa_lab_walk_atlas.webp": "42caaa7aadd931f3da09101aa80de522855bd308a0130a896b25cdff50a646a8",
    "medusa_lab_walk_atlas_quarter.webp": "dda8b9a3f3952a5c808121abd2bae616d9551f0d8b5831c3c998a0ef71b74106",
    "medusa_lab_melee_attack_atlas.webp": "7a1150b60e6bf322c907f85929ec85a09261d1379bc1643ce676b24d1e69134a",
    "medusa_lab_melee_attack_atlas_quarter.webp": "11e22b1a4852f87f9e9fa2573fd223a3c0abf97f61e95c29539962e984e702b2",
    "medusa_lab_melee_attack_up_atlas.webp": "d4f0a5995fd785eec12c118532194c982c457c3082f5be22f9438e6ab60f3036",
    "medusa_lab_melee_attack_up_atlas_quarter.webp": "33d912180af1b8a5706bed117773511a007a02c97c1d6de32d39e769a0054c26",
    "medusa_lab_melee_attack_down_atlas.webp": "7dd5411d32ab56df596767be8878bcc2ff97886ee76943a79d032e9b9ea1cd08",
    "medusa_lab_melee_attack_down_atlas_quarter.webp": "82fde3b4783ec1df6d41b2b25db0b561ad81d0281a6b13be687847ce46a4be65",
    "medusa_lab_death_atlas.webp": "98b23f0e8ae59feabc378db58dd5fcfd30ee16563d50ddcad1aa6592b35205dd",
    "medusa_lab_death_atlas_quarter.webp": "54bef8163aa258217a8ea15143469848ca2e6d61203d3d34bd870f63c98fdef2",
    "medusa_lab_attack_atlas.webp": "d0e56fffb5dfac11db8676e57d723998663a71574a0fe7a0768a7ba64fa78902",
    "medusa_lab_attack_atlas_quarter.webp": "5da125b5ab7b06411efb32d434be5b526506363e4334e0636799f93a92ed3c6f",
    "medusa_lab_attack_up_atlas.webp": "d89ac21a914a72d93ea68e5f8799d9aa5bd97c212777746ae0ae3c3a53470fc1",
    "medusa_lab_attack_up_atlas_quarter.webp": "825fadb3625f6c4f4cf1f74e554ae47512959666b82d0b79969c9cdd8dfe752b",
    "medusa_lab_attack_down_atlas.webp": "cd2fc47a9a36c22bc657628306d68e8c6f90cb68fd206a7342a4f19cf8e5b1e4",
    "medusa_lab_attack_down_atlas_quarter.webp": "5ac8d47ecff14c4907ed836993a568fee18715e5e865a1986f22a58c3984f0b7",
    "medusa_lab_projectile_atlas.webp": "5e6f91f9fda1187a66635b508a2605726e6d70dfb928c1c969cd07c36686bdc4",
    "medusa_lab_projectile_atlas_quarter.webp": "7c4b2aeb19dbb4462974a14cbbefda460a40df8e18e3cd10aeb4f55ef0244018",
    "medusa_lab_hit_atlas.webp": "6f7fcdf99c2181518a74290870aa4aef83bb190c6951b8b31c4f510258e09804",
    "medusa_lab_hit_atlas_quarter.webp": "66a9cd6e0b29a028b09f35b630f64f157b09bdd84b24fe9870b7a64ebafb2247",
    "medusa_lab_idle_atlas.webp": "47dc54f83cd4f426d33de89797709ac44316d088c0f558f9f03b5e3cdae9bc72",
    "medusa_lab_idle_atlas_quarter.webp": "61db03426809526ed9b2420e29df304331ae88c7109b3e86a92b7bf3cdb1af58",
});

function sha256(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// Root directory where all meta.jsons live: always HOC_ANIMATIONS_LOC, or an explicit CLI override.
// See src/assetLocations.ts for why there is no fallback path here.
const { resolveAnimationsOutputLocation } = require("../src/assetLocations");

const animationsRoot = resolveAnimationsOutputLocation(process.env, process.argv[2]);
// A local animation replacement can refresh its runtime copies without overwriting unrelated
// in-progress art. Metadata still comes from the complete canonical animation directory.
const copyAtlasArg = process.argv.indexOf("--copy-atlas");
const copyAtlas = copyAtlasArg === -1 ? undefined : process.argv[copyAtlasArg + 1];
if (copyAtlasArg !== -1 && (!copyAtlas || !/^[a-z]+(?:_[a-z]+)*$/.test(copyAtlas))) {
    throw new Error("--copy-atlas requires a lowercase snake_case animation name, e.g. thief_walk");
}

// TARGET IMAGES DIR: ../images from this script location
const imagesDir = path.resolve(__dirname, "../images");

const generatedDir = path.resolve(__dirname, "../src/generated");
const outputFile = path.join(generatedDir, "animation_atlases.ts");

// Ensure generated + images dirs exist
if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
}
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}

function walkDir(dir, acc = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDir(full, acc);
        } else {
            acc.push(full);
        }
    }
    return acc;
}

// Turn "wolf_rider" -> "Wolf Rider", "angel" -> "Angel"
function toUnitName(base) {
    return base
        .split("_")
        .filter(Boolean)
        .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
        .join(" ");
}

// Extract { unitName, state } from "angel_default_meta.json" / "wolf_rider_default_meta.json"
function parseMetaFileName(filePath) {
    const fileName = path.basename(filePath, ".json"); // e.g. "angel_default_meta"
    const withoutMeta = fileName.replace(/_meta$/, ""); // "angel_default"
    // Directional action names contain an underscore. Match those suffixes before the legacy
    // final-token parser so `ash_moth_attack_up` remains unit "Ash Moth", state "attack_up".
    for (const state of ["melee_attack_up", "melee_attack_down", "melee_attack", "attack_up", "attack_down"]) {
        const suffix = `_${state}`;
        if (withoutMeta.endsWith(suffix)) {
            const base = withoutMeta.slice(0, -suffix.length);
            return base ? { unitName: toUnitName(base), state } : null;
        }
    }
    const parts = withoutMeta.split("_");
    if (parts.length < 2) {
        return null;
    }
    const state = parts[parts.length - 1]; // "default"
    const base = parts.slice(0, -1).join("_"); // "angel", "wolf_rider"
    const unitName = toUnitName(base); // "Angel", "Wolf Rider"
    return { unitName, state };
}

function main() {
    const root = path.resolve(animationsRoot);

    if (!fs.existsSync(root)) {
        console.warn(`Animations root does not exist: ${root}`);
        process.exit(0);
    }

    console.log(`Scanning for *_meta.json and *_atlas.webp under: ${root}`);
    console.log(`Atlas .webp files will be copied into: ${imagesDir}`);

    const allFiles = walkDir(root, []);

    const metaFiles = allFiles.filter((f) => f.endsWith("_meta.json")).sort();
    const atlasWebps = allFiles
        .filter(
            (f) =>
                f.endsWith(".webp") &&
                f.includes(`${path.sep}atlas${path.sep}`) &&
                (f.endsWith("_atlas.webp") || f.endsWith("_atlas_quarter.webp") || f.endsWith("_atlas_half.webp")),
        )
        .sort();

    if (metaFiles.length === 0) {
        console.error("No *_meta.json files found.");
        process.exit(1);
    }

    /** @type {Record<string, Record<string, any>>} */
    const atlasMap = {};

    // --- Build TS meta map ---------------------------------------------------
    for (const file of metaFiles) {
        const info = parseMetaFileName(file);
        if (!info) {
            console.warn(`Skipping (cannot parse name): ${file}`);
            continue;
        }

        const { unitName, state } = info;

        const raw = fs.readFileSync(file, "utf8");
        let json;
        try {
            json = JSON.parse(raw);
        } catch (err) {
            console.warn(`Skipping (invalid JSON): ${file}`, err);
            continue;
        }

        if (!json.meta) {
            console.warn(`Skipping (no "meta" field): ${file}`);
            continue;
        }

        const meta = json.meta;

        // ⭐️ Derive animation timings from totalDurationSec
        if (typeof meta.totalDurationSec === "number" && Number.isFinite(meta.totalDurationSec)) {
            const baseTotalMs = meta.totalDurationSec * 1000;
            const loopDurationMs = Math.round(baseTotalMs * 0.9); // 10% faster
            const pauseMs = Math.round(loopDurationMs * 0.4); // 40% of loopDurationMs

            meta.loopDurationMs = loopDurationMs;
            meta.pauseMs = pauseMs;
        }

        if (!atlasMap[unitName]) {
            atlasMap[unitName] = {};
        }
        atlasMap[unitName][state] = meta;
    }

    const lines = [];
    lines.push("/* AUTO-GENERATED BY scripts/generate_animation_atlases.js — DO NOT EDIT */");
    lines.push("/* eslint-disable */");
    lines.push("");
    lines.push("/**");
    lines.push(" * One atlas entry per unit per animation state. Typed as an EXPLICIT record on purpose:");
    lines.push(" * the old `as const` + distributed-keyof types collapsed every indexed lookup to `never`");
    lines.push(' * the moment the external art set went heterogeneous (a unit shipping only an "attack"');
    lines.push(' * atlas while the rest carry "default"), which broke the client build at deploy time');
    lines.push(" * even though CI — with no external art drive — stayed green. Consumers already resolve units and");
    lines.push(" * states at runtime (`name in animationAtlases`, `Object.keys(...)`), so string keys");
    lines.push(" * with a strict value shape is the honest contract.");
    lines.push(" */");
    lines.push("export interface IAtlasAnimationMeta {");
    lines.push("    frameWidth: number;");
    lines.push("    frameHeight: number;");
    lines.push("    atlasWidth: number;");
    lines.push("    atlasHeight: number;");
    lines.push("    frameCount: number;");
    lines.push("    fps: number;");
    lines.push("    frameDurationSec: number;");
    lines.push("    frameDurationsMs?: number[];");
    lines.push("    /** Hold the neutral first pose after all authored frames have played. */");
    lines.push("    cycleEndPauseMs?: number;");
    lines.push("    pages?: Array<{");
    lines.push("        imageKey: string;");
    lines.push("        firstFrame: number;");
    lines.push("        frameCount: number;");
    lines.push("        cols: number;");
    lines.push("        rows: number;");
    lines.push("        width: number;");
    lines.push("        height: number;");
    lines.push("    }>;");
    lines.push("    totalDurationSec: number;");
    lines.push("    layout: { cols: number; rows: number };");
    lines.push("    footAnchorY?: number;");
    lines.push("    geometry?: string;");
    lines.push("    encoding?: string;");
    lines.push("    phases?: {");
    lines.push(
        "        intro: { startFrame: number; endFrame: number; loop: boolean; distanceCells?: number; speedMultiplier?: number };",
    );
    lines.push(
        "        flight: { startFrame: number; endFrame: number; loop: boolean; distanceCells?: number; cycleDistanceCells?: number; speedMultiplier?: number };",
    );
    lines.push(
        "        landing: { startFrame: number; endFrame: number; loop: boolean; distanceCells?: number; speedMultiplier?: number };",
    );
    lines.push("    };");
    lines.push("    loopDurationMs: number;");
    lines.push("    pauseMs: number;");
    lines.push("    /** Forward-compat: Google Drive art metadata evolves ahead of this generator (e.g. the");
    lines.push("     * multi-phase intro/walk animation data). Undeclared keys pass through untyped so a");
    lines.push("     * new meta field never breaks the DEPLOY build while CI (no external art drive) stays green. */");
    lines.push("    [key: string]: unknown;");
    lines.push("}");
    lines.push("");
    lines.push(
        "export const animationAtlases: Readonly<Record<string, Readonly<Record<string, IAtlasAnimationMeta>>>> =",
    );
    // A meta field may carry the authoring machine's absolute path (some *_meta.json reference their
    // source that way). Emitting it would bake one person's home directory into a tracked file — and
    // gameImageAssetPolicy rejects exactly that. Every art reference is a file name, never a location.
    const withoutAuthoringPaths = (value) => {
        if (typeof value === "string") return value.startsWith("/") ? value.slice(value.lastIndexOf("/") + 1) : value;
        if (Array.isArray(value)) return value.map(withoutAuthoringPaths);
        if (value && typeof value === "object") {
            return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutAuthoringPaths(v)]));
        }
        return value;
    };
    lines.push(JSON.stringify(withoutAuthoringPaths(atlasMap), null, 2) + ";");
    lines.push("");
    lines.push("export type AnimationUnitName = string;");
    lines.push("export type AnimationStateName<_U extends AnimationUnitName = AnimationUnitName> = string;");
    lines.push("export type AnimationAtlasMeta = IAtlasAnimationMeta;");
    lines.push("");

    fs.writeFileSync(outputFile, lines.join("\n"), "utf8");
    console.log(`✅ Animation atlas meta generated successfully: ${outputFile}`);

    // --- Copy atlas .webp files into ../images ------------------------------
    let copied = 0;
    for (const file of atlasWebps) {
        const basename = path.basename(file);
        if (copyAtlas && !basename.startsWith(`${copyAtlas}_atlas`) && !basename.startsWith(`${copyAtlas}_page_`))
            continue;
        const dest = path.join(imagesDir, basename);
        const pinnedHash = PINNED_ATLAS_SHA256[basename];
        if (pinnedHash) {
            const actualHash = sha256(file);
            if (actualHash !== pinnedHash) {
                // A cloud sync that lags the approval must not brick regeneration on every OTHER
                // atlas: when the approved file is already in place, keep it and move on. Only a
                // missing approved copy is fatal — then there is nothing correct to ship.
                if (fs.existsSync(dest) && sha256(dest) === pinnedHash) {
                    console.warn(`⚠️ Keeping approved ${basename} (source copy at ${file} is a different revision).`);
                    continue;
                }
                throw new Error(
                    `Refusing to replace approved ${basename}: expected sha256 ${pinnedHash}, got ${actualHash} from ${file}`,
                );
            }
        }
        try {
            fs.copyFileSync(file, dest);
            copied++;
        } catch (err) {
            console.warn(`Failed to copy atlas webp: ${file} -> ${dest}`, err);
        }
    }

    console.log(`✅ Copied ${copied} atlas .webp files into: ${imagesDir}`);
}

main();
