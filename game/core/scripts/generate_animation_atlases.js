// scripts/generate_animation_atlases.js
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Approved animation art that must never be silently replaced by an older export. The Scavenger
// walk uses the user-approved original eight-frame loop. Keep that selected version through
// later image-generation passes instead of restoring the older six-pose gait.
const PINNED_ATLAS_SHA256 = Object.freeze({
    // Crafted recipient buffs, 2026-10-22.
    "vfx_blacksmith_double_punch_pop_atlas_quarter.webp":
        "fe414d3648238dd8a6cf670ced6d70568892962f4d9f4e11a1ab7b13a6392bbc",
    "vfx_blacksmith_double_punch_pop_atlas.webp": "ee5bebb4d3b298d9814bad60b980ed4cb1e62f67af76d3ae92d022a5146f2f39",
    "vfx_blacksmith_double_shot_pop_atlas.webp": "0b97e2aecbea325ddf46b90a6e3f739b8ef2dd91dc53df10b36dcfebd1dc7f39",
    "vfx_blacksmith_double_shot_pop_atlas_quarter.webp":
        "962ea98edcb5b0b8dea8ce3ab857ad713c765a968ec82035a241bdb5ca6f3f68",
    "vfx_blacksmith_frozen_sword_pop_atlas_quarter.webp":
        "c47d19fcf19c517d4c362946767bdc1550865846f3f0c080564006401e07e166",
    "vfx_blacksmith_frozen_sword_pop_atlas.webp": "6d3d3b9e0b1f91ddad85646b4cf37dae047194a8ea7f1c34b126f764a3395118",
    "vfx_blacksmith_frozen_bow_pop_atlas_quarter.webp":
        "8932ec227cda9b9c08a67f51e141ddba4c22fe9d38bd7deafea5602dace63757",
    "vfx_blacksmith_frozen_bow_pop_atlas.webp": "bac34c7b9711a6328d60eaf947fc0d08a3e7526abf4ccf239b946187f40cdb94",
    // Blacksmith flag spell cels, 2026-10-20.
    "vfx_blacksmith_craft_pop_atlas.webp": "9de518a45f58f51cde659350284248ae3ca93c6a3d3503154b5d6ec28c25b969",
    "vfx_blacksmith_craft_pop_atlas_quarter.webp": "c6bd127eecd79781d8bb77636039c01e2e003b823bfd694fc48019480ac42e28",
    "vfx_blacksmith_armor_pop_atlas.webp": "fd4067259482cb93fd3003385e9c0eb3a610380b0feb7d495869c944b3cc616a",
    "vfx_blacksmith_armor_pop_atlas_quarter.webp": "0cd0ba61eecb903cc8b0b3c52cb52ff99c0f96275122816e35e2f5e488f8e932",
    "vfx_blacksmith_weapon_pop_atlas.webp": "7504988b53e04938d55e7796f87a078e1c53f53d6ede1ce84d7e902c79763d6c",
    "vfx_blacksmith_weapon_pop_atlas_quarter.webp": "08a902ea95e9d0e4fbd3482bd0fbf3400afd404e5d522747a9685f9678a64537",
    // Peasant Bitter Experience: painted boot-stamp cels, 2026-10-20.
    "vfx_bitter_experience_pop_atlas.webp": "780f6cc2926c4f6883832e92914fc05ed9fd8ceb1b87515df777d2839cee8cd1",
    "vfx_bitter_experience_pop_atlas_quarter.webp": "33597b865b743289be102a0c57e47d888e409d57fa76354974894c97c68da485",
    // Arbalester Leather Armor vulnerability: painted impact cels, 2026-10-20.
    "vfx_leather_armor_pop_atlas.webp": "b1496849606bf6bf66b9b27ddb8078f8863880ac09c0a9a5a9c8ef993042f60e",
    "vfx_leather_armor_pop_atlas_quarter.webp": "fb08cef084b317ba3e9d8478d2d296feded9f0b5166ca880a406a65aa1dcd09b",
    // Leprechaun Lucky Strike painted die cels, 2026-10-20.
    "vfx_lucky_strike_pop_atlas.webp": "1a9ae0650040321896b87e26cb11b5f761d805b1fcb2a553c307f318e4f6c39a",
    "vfx_lucky_strike_pop_atlas_quarter.webp": "36ac7dc216cdd08afd7b3400ff79646568f5f9d2707be730e8a11a38166c0e04",
    // Dryad Hamstring chained-wing cels, 2026-10-20.
    "vfx_hamstring_pop_atlas.webp": "4983cc641f1f73fcaadd1b522fa87016443734ee7c4704ebc77cacf1fecbe8e3",
    "vfx_hamstring_pop_atlas_quarter.webp": "cc5f591f22ece04707e84016950148a22ed9a1e7d3ffb7071e418fc70e0a50ab",
    // Troglodyte flag effects: sixteen painted cels each, 2026-10-20.
    "vfx_blind_fury_pop_atlas_quarter.webp": "9593df15e19dd420367b35e4929033541e3a556f1d7c88b2637c18f2baab23a7",
    "vfx_blind_fury_pop_atlas.webp": "ce695b1d37f1461071ff3a4b1b6ed0474097bb0803ad71f2fe23ea637b2592ed",
    "vfx_miner_pop_atlas.webp": "cd362132ff4740591a688ee1c106b445b29d812380758fae877180e0d4f31054",
    "vfx_miner_pop_atlas_quarter.webp": "9548cca721487f3f93a250787c527150c824a3879e73caeaaaf3a4280e2b5249",
    "vfx_madness_pop_atlas_quarter.webp": "0ffaba12fdce5afb5c095e24060c44910070dc20218e25e564be03d8e43050b6",
    "vfx_madness_pop_atlas.webp": "7dd1a4472b49ad4b2a78b50e3eaae5fde4a79b164c570c4891d871f26f21a67e",

    "vfx_mage_misfortune_pop_atlas.webp": "7198edae3285da4797a632390c40d70f991c7e3dd933f7cad26a729570f61319",
    "vfx_mage_misfortune_pop_atlas_quarter.webp": "23922ef9e3015f1914fc661ae2d22ace4e94c061f37f861e648d259f3e77155b",
    "vfx_mage_fireforged_pop_atlas.webp": "ae0959f6f2d961ce8a6673b40468b56fb0307d21e4cc3ca3d97c6ff58bbb95b1",
    "vfx_mage_fireforged_pop_atlas_quarter.webp": "31088fcc7158ec83519f427cd54e1b6725918682148e62db33fc6751452fb4eb",
    "vfx_ring_fire_hollow_burst_atlas.webp": "a7300a1dd6522cd882a9c59f8146f8913aaa37e3196a4b256eaf75c643dfdca1",
    "vfx_ring_fire_hollow_burst_atlas_quarter.webp": "b703be2d889204ddb19199baccbcac7d451df27b580ef9415ed8094aab3ce57f",
    // Centaur Piercing Spear above-target cels, 2026-10-20.
    "vfx_piercing_spear_pop_atlas.webp": "02da6816236f65a3a608d4bf28bf1577d45ea2a993cd9bc9dcf55f0de6e4f342",
    "vfx_piercing_spear_pop_atlas_quarter.webp": "1d210aee240d7d2bac65db802e944d8eb77efd06b6a8a8bd5cff6de32cdba43a",
    // Fairy Small Specie: nine dodge cels above the fairy's flag, 2026-10-20.
    "vfx_small_specie_pop_atlas.webp": "f7a0571d995eb9fd2151a480d8ee65ba7997eb0970f1820737a164880f3856c9",
    "vfx_small_specie_pop_atlas_quarter.webp": "b24fc92d04039745e60fc43e4d54ea31970ab3bb53a51ccc0917a69fa4d32471",
    // Wind Flow above-flag wind cels, 2026-10-18.
    "vfx_wind_flow_pop_atlas.webp": "99ed303ecba4ccee444b1ee18a228022e00c4c3a623e15e4e70e7d55b80e244f",
    "vfx_wind_flow_pop_atlas_quarter.webp": "65dc54445fc44557c62fc956532c6d45802758097fe085270a1d1e589959d241",
    // Satyr buff cels: roaring lion and blessing hand, 2026-10-18.
    "vfx_satyr_courage_pop_atlas_quarter.webp": "2be5f83ef66187f20495ba76f3ba4226d02c54c9efa82a8c3c41acf8346c392b",
    "vfx_satyr_courage_pop_atlas.webp": "b683d87730a0b6561492ed776c61e28393573739c41b2657acf65c4eab80d0a2",
    "vfx_satyr_helping_hand_pop_atlas_quarter.webp": "8b735c16d58853fd8b5dce953553a477a77a6ca7d8ac136fefb65d1b33b86719",
    "vfx_satyr_helping_hand_pop_atlas.webp": "cb04fe1e71fc3b0ff4af863ac07e2651fe48f15984dca7199b3cd6ee3a2f3271",

    // Wild Regeneration: wounded palm heals, then dissolves above the flag.
    "vfx_wild_regeneration_pop_atlas.webp": "311cd0e377cb2b0c56e8f7f408a8970d7172d7b6d42cfa68ca0dc35816621390",
    "vfx_wild_regeneration_pop_atlas_quarter.webp": "75d4bc75c514bab03535d0a6eac9e1c7848ed8ff4a647ad6bc8163c0ac259608",
    // Shadow Touch v3: icon-faithful hand, sculpted highlights and sixteen grasp/release cels, 2026-10-18.
    "vfx_shadow_touch_pop_atlas.webp": "5a8f07f60d0e669f91dd3ae54cca2d62be49c6e6bde5d53db9674b1689f28f21",
    "vfx_shadow_touch_pop_atlas_quarter.webp": "3c14993a6151d98064529dcc81ee3a63d3dec259ff3909a55c4a67eb746f0670",
    // Shatter Armor: steel cuirass fracture above the recipient flag, 2026-10-18.
    "vfx_shatter_armor_pop_atlas.webp": "6cafc816e5c94799779884c19a024a236f7329de8520fdddd802df518b526f3d",
    "vfx_shatter_armor_pop_atlas_quarter.webp": "5964259befc29f0b4fac2aa69ac5439db7995b04191da8d24cc319fb1508462c",
    // Mantis Paralysis: painted ability-icon cels, 2026-10-17.
    "vfx_paralysis_pop_atlas.webp": "aa15b64799d8cdbc97cdca1fedb56b946300c093aca5f7081ff7bbfa67f1a858",
    "vfx_paralysis_pop_atlas_quarter.webp": "d40726e49fccd0dd45b07e27c144cb497f436021dd9445a41cbe16261994f3f9",
    // Abomination Flesh Shield palm, sixteen connected finger-curl poses, 2026-10-16.
    "vfx_abomination_hand_aura_atlas.webp": "f21d58e1c3b625be4bdfe384fb93652bdd4dbcd4847ce1a59dd43673194799c1",
    "vfx_abomination_hand_aura_atlas_half.webp": "874192131acbe399fb19e60e3ff2c8a0c648a1bd0c9cc3fce5e99f1cd005daa4",
    "vfx_abomination_hand_aura_atlas_quarter.webp": "45fbacb6cb6d7bfe67af1c437ccc9af0e595b4ca51aac59ca1ddc7656f8f136b",
    // Unicorn retaliation and blindness flag cels, 2026-10-16.
    "vfx_unicorn_one_in_the_field_pop_atlas.webp": "e405d5c4e98fc086da2de9c57e430770f9dfd228a59266d3b1393bfcd748e7cc",
    "vfx_unicorn_one_in_the_field_pop_atlas_quarter.webp":
        "0a1eedb2cf457082a27e25624d96119efe2ba4fc766dba2169c4d71d178d3f8c",
    "vfx_unicorn_blindness_pop_atlas_quarter.webp": "ad7cb1eaf3c8c0e8e104701ada0aa33929531814c04ed1d5741bc39dc73f900c",
    "vfx_unicorn_blindness_pop_atlas.webp": "36ff4d0b42637a872d50b989ee7314f26067bae30db9a9672bc34a02925b1467",
    // Dulling Defense sword fracture above the flag, 2026-10-16.
    "vfx_dulling_defense_pop_atlas.webp": "aa06e5957732a219ea4c3417badbfa5757d111a0eb3655e951143d12fce0d5d0",
    "vfx_dulling_defense_pop_atlas_quarter.webp": "3e52aceb9f0e6b554c1dcebc07c8f15d712d0931c0f1a7043ca05688506fd029",
    // Empower animated hand and cyan orb, 2026-10-16.
    "vfx_empower_pop_atlas.webp": "37033dcc5afcf21f1ea938c0a2de56582ba9e56c014700c06d3f78cf0117a93b",
    "vfx_empower_pop_atlas_quarter.webp": "d2a9bc9769afb5023ae35cc4617041c6d0c0be13f42078ee4fe21f7aa882ad37",

    // Black Dragon Enchanted Skin above-flag activation, 2026-10-16.
    "vfx_enchanted_skin_pop_atlas.webp": "e9ef9c2ba6a7f6bb48af2c47b0976837fb138a9947ee14404ab789b7be5cbc27",
    "vfx_enchanted_skin_pop_atlas_quarter.webp": "06c590ff823c29f9d715c6306f7f5a75db7f9e0edac0fe6aed30d42e6ce4eebe",
    // Made of Fire above-flag activation, 2026-10-16.
    "vfx_made_of_fire_pop_atlas.webp": "e42faeb18032c3edb7b10cc4dc4075cfb4329aab346b7d61bffadf7c158f7da8",
    "vfx_made_of_fire_pop_atlas_quarter.webp": "bc5f7550bd82a639fb91eede6d594d397832700bb1b134e16143507d85e2b292",
    // Ogre Mage animated book symbols (human and gold mirror); mass casts reuse them, 2026-10-16.
    "vfx_ogre_riot_pop_atlas.webp": "b2f3668de4af4eac2a360a5963b00bf7c5b9daf7ca9f00d16dc7acb2eea90140",
    "vfx_ogre_riot_pop_atlas_quarter.webp": "d879e88fba90e4b37d398e68a437608a785152ed2d9367fda6c053a1003222e5",
    "vfx_ogre_magic_mirror_pop_atlas.webp": "88b1a3ab388d8bc0a78ed03878a90d64d1b1b638be189758af639a942629b2b7",
    "vfx_ogre_magic_mirror_pop_atlas_quarter.webp": "01f366b2856862872ff23113aa5b5284950b9dd5e5e4e86034f32deb9d5ab216",

    // Realistic fireball/ring and falling meteor spell cels v2, 2026-10-16.
    "vfx_ring_fire_burst_atlas.webp": "01d2a24936c4f9d8205178732500c51928fbe87cdd7de1b2c6c8411952ebf4b2",
    "vfx_meteor_shower_impact_atlas.webp": "8fd0839ccf81668985330a237a076699c55d2558dd48d210791fd082465c5ed2",
    // AI activation brain: authored thinking pulse, 2026-10-15.
    "vfx_ai_turn_brain_loop_atlas.webp": "cc7ad950e007a80f55d0ac7e4d5868dedabb9f0e49fd6e73248a8e35b0949c50",
    "vfx_ai_turn_brain_loop_atlas_quarter.webp": "c5c1c3b07d85f469be2900ba23bd50cf4c27ab35ad3754560b2f65b198a66efb",
    "vfx_angel_resurrection_pop_atlas_quarter.webp": "6ecbdb60c333e803abd3f7a1783567b65b70b2a96082a23af7f8182ec4180833",
    "vfx_angel_resurrection_pop_atlas_half.webp": "1b31652d9fb70833a95bc04cc716a0ae6ca7c6a8a6f08c52f9d96cc165ea70b0",
    "vfx_angel_resurrection_pop_atlas.webp": "610b94d960b3600832d566876ee2976a276c98e51a79a96d88c9252d843486be",
    "angel_lab_death_atlas.webp": "07972bb16151ed6b80492edac5ee7ae9b57b32e162a639343c6e1c9b5fb83414",
    "angel_lab_death_atlas_quarter.webp": "25d525a9b47d55fc6ee864cf4b66119096b27a30be648d0281862c0e938c31b5",
    "angel_lab_death_atlas_half.webp": "976714f1701d573993e00d684b1db92e4b8e4e8722643c5e2056b3cbb6e7c575",
    "angel_lab_melee_attack_atlas.webp": "88e388d3b7a41ac11bee581132ef86b227565d8cb8fc21606a8527d1338dcab7",
    "angel_lab_melee_attack_atlas_half.webp": "1525bbcca002c8513bb4d25a443d0cba96e66ed89d1a1d0a611bfaa250252781",
    "angel_lab_melee_attack_atlas_quarter.webp": "d2c2673d19b6abe6a6485b9b07b5e7613d796dda5c2d75c5da49a00fea3dc1f7",
    "angel_lab_melee_attack_up_atlas.webp": "fbe16d79a2c86698e397748796109019a3517b56554f3d9e8e44750a6dd15ad6",
    "angel_lab_melee_attack_up_atlas_half.webp": "f06ec09adc466406812cc296852706a100e5124f0dacc2e8573ea5b807f6a2ce",
    "angel_lab_melee_attack_up_atlas_quarter.webp": "61902d0b2c3dc7d7f874e8aabea5a408158dbabbfc3446e5a41cbe3ab62d0ad7",
    "angel_lab_melee_attack_down_atlas.webp": "3b0d5460b15d9503585a1e81d1cadfb5402512f0a373034069a6b1e104963cb8",
    "angel_lab_melee_attack_down_atlas_half.webp": "1fc335074bf09c064f1ac356f3c8e73fdb29d3a7ab27137c40139a7ca8178205",
    "angel_lab_melee_attack_down_atlas_quarter.webp":
        "ca5dffcec4d9496bd5cabfb906db38dd0324971e56b50f676b2e44498c05f5ca",
    "angel_lab_hit_atlas_half.webp": "d37c9c6e1c308f44a73596a812ef041569f1a5c98c607113b702efd6a51cf79e",
    "angel_lab_hit_atlas.webp": "8396ec43a2a585032a70aebb1f303724074b065addf81451c8c66161462277fd",
    "angel_lab_hit_atlas_quarter.webp": "983fb0add0a4c65555746f9d0e94adde397c16741579639d03913a0627898a07",
    "angel_lab_cast_atlas_quarter.webp": "3e3ec1980b40d405567ed755daf2f41c789d99138a6e59d1be31f887787b86cd",
    "angel_lab_cast_atlas.webp": "db75dcedd04f995cc42afb8b29095985e4de83ee1ec94f49ae59297c349311de",
    "angel_lab_cast_atlas_half.webp": "a3a1c09387ded77d779b1c435e21a10b2fede8c443dfb7e9a9faa77ab1eb7a0c",
    // Redrawn full-body Black Dragon fire attacks, 2026-10-16.
    "black_dragon_lab_attack_atlas.webp": "8d49067846df181a3e1ab5d92a292ec19b0f6098667c3f93eb62a925053e2557",
    "black_dragon_lab_attack_atlas_half.webp": "19a6d1f6aaaac544a6585c32938801a85218a335983e60b59433075e406f0f4c",
    "black_dragon_lab_attack_atlas_quarter.webp": "41a487fcac6476877ce16e45a834eadfefae8ae9b252f67fb380da6d4180d091",
    "black_dragon_lab_attack_up_atlas_half.webp": "ca92a34f5ed471a508797660166695b7f1bb06069492d424d7223340d54b0dae",
    "black_dragon_lab_attack_up_atlas.webp": "d6ac01f608515f3a11eb231ad4175092ffda32b16884b0447135f000ab9799da",
    "black_dragon_lab_attack_up_atlas_quarter.webp": "f1754d05f7a5a9573f2a208fbd678fb1f116336afcb5bfc64cacba2ce1ee4e27",
    "black_dragon_lab_attack_down_atlas.webp": "428566dc600514343674cdfa0c3fa6b2a895a59a865cffdf57a034ab60ea0482",
    "black_dragon_lab_attack_down_atlas_half.webp": "f85d4563c38c25fefc57787fd3e9846b2993fceb4c49fd56cf2ed9d5e1c26abd",
    "black_dragon_lab_attack_down_atlas_quarter.webp":
        "141b851c4837b9c45e1ea4d29a234cfdf8efe77f0763fc151875d5511a28078a",

    // Anatomical full-pose Infest hatches, 2026-10-14.
    "vfx_arachna_infest_spider_hatch_atlas.webp": "4468e5e49d232c58fad39549dd317cd10baed1497d71ca0463413838482c6074",
    "vfx_arachna_infest_queen_hatch_atlas.webp": "2f194d60a5e02d82f0944f81bfa0708a04836fc15f47591f9452fd880d77a657",
    "vfx_thunderbird_chain_arc_atlas.webp": "780735f6b7f44c8a122f640636a321a47045887fed70953bd49f2f7603cb3a52",
    "vfx_thunderbird_chain_arc_atlas_quarter.webp": "9082156f0f7913277443b44307f62aa4eddd266287bd937e86539098bca58d5f",
    "vfx_thunderbird_chain_impact_atlas.webp": "28a36f0cba6e31cd726e0a5b6e20bdc635e5b46b453bd7d0ff6524416fc708be",
    "vfx_thunderbird_chain_impact_atlas_quarter.webp":
        "874d94d60abd3d8dc19972a6c55c20188421983878248086af640e5f48c928a6",
    "thunderbird_lab_melee_attack_down_atlas_quarter.webp":
        "c62d7427a4b7c1331db8aae18b7dc6eac4af2e0bdcfcd07d1d7ff325fc1aa392",
    "thunderbird_lab_melee_attack_down_atlas_half.webp":
        "ea1a61a27afc3716319db04b8d90adb4eb2672a9c11e71ad050a62dd5be35c49",
    "thunderbird_lab_melee_attack_down_atlas.webp": "8a76b0feb34aa0c7231d6f070da375b37ef2fc8b32dacfa766e4031f4e189d1f",
    "thunderbird_lab_melee_attack_up_atlas_quarter.webp":
        "bde648b8505b0f76ab5aeef233a1dd6e7784ff2fa812a09a592e29a36bb68ad8",
    "thunderbird_lab_melee_attack_up_atlas_half.webp":
        "70f8e073623658422f243b3e793edc52708d3741d8ea9a3d2e37cabbecc464bc",
    "thunderbird_lab_melee_attack_up_atlas.webp": "dcfc3313b2f42bd06842d3069f5f3b59529a4bc8d4944d972ed2753dc05a19cc",
    "thunderbird_lab_melee_attack_atlas_quarter.webp":
        "3bd563171d20a9ea3b33fe081b0b75bb9ea0a88f574a30b0efac6af6a5101184",
    "thunderbird_lab_melee_attack_atlas_half.webp": "ecd314179507d4ef9b3de538ef891f105498b63f3ce983a4641f0a9142ceaf44",
    "thunderbird_lab_melee_attack_atlas.webp": "db8e15272ffbc7b095606243a69fa8ef1ce87f4c39cdbeafae3101c8458bf6c5",
    // Champion six cell-centred neon double-chevron rows, 2026-10-14.
    "vfx_champion_arrow_aura_atlas.webp": "9617a9456b6ff0e26df0dfbccd11a5ae35dc1f2d33cae7de60466cd355051df3",
    "vfx_champion_arrow_aura_atlas_quarter.webp": "0771b191041a11f93eef88598f8b1506e158f50b0b356a9adb1e8dd27acdf2da",

    "vfx_abomination_sand_gust_aura_atlas.webp": "3e4b925f76fe72abedd2bee54863112fc1057efcecc62814ab3c40fe396e77c0",
    "thunderbird_lab_death_atlas.webp": "e2eb130fffd3021e9d4a94a58c01b7e116e752c524259afc053e73cd59e3de44",
    "thunderbird_lab_death_atlas_quarter.webp": "0335326c64d05cf7957a6a7a5ba9e3249948bdfb7b3c1656c11dd00151a89b85",
    "thunderbird_lab_death_atlas_half.webp": "35cdd231978f6b8bd43012745bd02ca19ec360c0a2f18562b2fb0e8eeb42408a",
    "thunderbird_lab_hit_atlas_half.webp": "4aa02c217b1003c4d2b7fd50b40be39ddb7249decdc326ba84e616b3e0032f0c",
    "thunderbird_lab_hit_atlas.webp": "1a237b78bdf67e773236f8ebc291d49c22fce4db76dcfc4bb2062ff616b0ddb1",
    "thunderbird_lab_hit_atlas_quarter.webp": "a7cf5293c4ffc638c8027d6051019fc6e7fdd09a88538ce3ab09aa8b448899ff",
    // Boar Saliva: v2 jaw motion with restored animated drips, 2026-10-14 v3.
    "vfx_devour_essence_short_atlas.webp": "697110afdcf1525b691d015fd7bcbc84f869b70bddfc2ccabd20d0f3564e815f",
    "vfx_devour_essence_short_atlas_quarter.webp": "d7fc70f8c1fbb9bea6efa656f8a82953eea1c0bab1fa58a9f00828af2736170d",
    "vfx_boar_saliva_short_atlas.webp": "ae86c57910edd5a433d3050de5f2eaa99890709b83aa7b2dd131b21757714cc2",
    "vfx_boar_saliva_short_atlas_quarter.webp": "6b54840336c86ce4e1bc6b700aa1f46377512ae5dab45e4a557bb9ffb428c0b0",

    "vfx_abomination_dust_aura_atlas.webp": "535fd310b1d1acf1a19a496e62f17b9835c491557e89f812f2d1d1817a99c931",
    "thunderbird_lab_idle_atlas_quarter.webp": "8f912413af7212083bef4c6203d37e8ddd5e72dac481d4525a06e4aae16ebc75",
    "thunderbird_lab_idle_atlas_half.webp": "1b215432030cf0c205b9776420503be2c1d0b9bc0e4c3f87f15b17ea392df9ec",
    "thunderbird_lab_idle_atlas.webp": "8cc0d603917e20bed1f468f1e5e7852626bf501f2b000420523bbfdd42dee774",
    // Approved painted 1/2/3-cut Deep Wounds flag effects, 2026-10-12.
    "vfx_deep_wounds_level_1_atlas_quarter.webp": "04d6a4802fda19db2b48606910fa74c992add22903f422320279376b71f7628d",
    "vfx_deep_wounds_level_1_atlas.webp": "fcbf6aa7feebfdfca79ea50a217a2f297d74b0061ffcc7f021a6f443cda0fe8b",
    "vfx_deep_wounds_level_2_atlas_quarter.webp": "cc78c05cdcbbe8654e216321601c9a271c96b1a6e0469144cdb757e459b6810c",
    "vfx_deep_wounds_level_2_atlas.webp": "cee1a0f536e26e7a79cad38aad69a92d2a8934637497b0dd0cdb91e5a28ef5e7",
    "vfx_deep_wounds_level_3_atlas.webp": "8fd1eaaecccf2cc87a28aee637680b9b93b1d5779e3f10d23787c30f9d2c72d1",
    "vfx_deep_wounds_level_3_atlas_quarter.webp": "21711728bac7899990c06154c59b0221142be1f5ce9c131a666598fca5352fb3",
    "vfx_abomination_sand_aura_atlas.webp": "734650ecec378f93c034ef50555eb763981e64f2b1d1f67f11539b204a8d642d",
    // Approved one-second Unyielding Power full-arm curl, 2026-10-11.
    "vfx_unyielding_power_curl_short_atlas.webp": "48debe51c298bce0930b19a7e7413e83d42a3e216a808f5a3b2919259cdc51e2",
    "vfx_unyielding_power_curl_short_atlas_quarter.webp":
        "09d633f760f4dbca81016d1af8e2589895978507b73bac14c1f1ee67c652ffb2",
    "vfx_arachna_infest_hatch_atlas.webp": "6c4dfad9b257f5c09e8fc54e98135b5d9b0668b871473e4f67403054f932ca25",
    "vfx_predatory_assimilation_grab_atlas.webp": "9d099ac7898fc1627a13ae04d410b4daccae9371b61fbe7577193ae6af10384c",
    "vfx_arachna_web_aura_atlas.webp": "09212dd86519b54d5c3996c3ee6c5cc8e62e7888b37818e0c3f7cb4b39d0a34e",
    // Champion width-registered 19-cel directional spear attacks, 2026-10-12.
    "champion_lab_melee_attack_atlas_quarter.webp": "e339378af7f7dbc7cb9df5587271d6224cfc98ef6996a4a80fff7009b11eb082",
    "champion_lab_melee_attack_atlas.webp": "190753511a099a03144e1a775024d6017858ce7582a6396e790716814ca4c68d",
    "champion_lab_melee_attack_up_atlas_quarter.webp":
        "df452687277ff582a32efeb3efb7b8981885b7f23148bd5651759dd8af8c413d",
    "champion_lab_melee_attack_up_atlas.webp": "91f4ad62aa3a25d337fee74b5e7a8df26d107c98316a340bb3b12d80377be351",
    "champion_lab_melee_attack_down_atlas.webp": "38eebe1a2ba8451fcd1842bf2a2bf8a5878567c4dd70a7ae6345aa4cd91ef87f",
    "champion_lab_melee_attack_down_atlas_quarter.webp":
        "4896f784ad020e71c7532329eb2f51ba9cba1693a8aa3c40925c0df2e7ddc92d",

    // Mini spider full-body gait and attacks, 2026-10-09.
    "arachna_spider_lab_walk_atlas.webp": "1f918f0e1d589680ef9b002c14e77e70e01f2e26bd26156615dcf6c98d19e9e9",
    "arachna_spider_lab_walk_atlas_quarter.webp": "756b773f7a17b64289f7f7c80f687170535d0c034d38017772302d68c7062758",
    "arachna_spider_lab_melee_attack_atlas.webp": "d6910ba1b5c1a8336b734689efbc065544667da393b591a1db8a8f99b0eaed18",
    "arachna_spider_lab_melee_attack_atlas_quarter.webp":
        "06d147107d015a7179df29e73769170583e7540b89b5e49e03ef2a6a47a061a1",
    "arachna_spider_lab_melee_attack_up_atlas.webp": "3eedd83e097b33eadc2a91be8a3a2a191c3c4657720b642807cbdad9a3d1dadd",
    "arachna_spider_lab_melee_attack_up_atlas_quarter.webp":
        "9a62bd892b57c02f7450dd173357b2d540d6747dd0d4bd7c2fd236f4ef4936d4",
    "arachna_spider_lab_melee_attack_down_atlas.webp":
        "56ea8e7ddca55139ecad7e7446e3a5c6ff276c46393be4e6f472b5ed64c52cd0",
    "arachna_spider_lab_melee_attack_down_atlas_quarter.webp":
        "c9b5ace2386709851247cda3de283b5f17195a623508722a936ed99ddf449ea2",
    // Frenzied Boar: compact side bite + saliva (v8, 2026-10-12); up/down retain v7.
    "frenzied_boar_lab_melee_attack_atlas.webp": "66cdc3172847a6e900c26b3c8415f729b982915051976758db6bac5af6f340bc",
    "frenzied_boar_lab_melee_attack_atlas_quarter.webp":
        "46767a43687a702149c09e49823806422821813d12ae6df90d515d7d2eb2c13e",
    "frenzied_boar_lab_melee_attack_up_atlas.webp": "bc26df697c822de8f102a39be102dcb0de42ffcf322e5a121bd55e623ec2e9db",
    "frenzied_boar_lab_melee_attack_up_atlas_quarter.webp":
        "221857957a0af3790249a30bf92c0eabaaa1ab3575d58d9ad7c31ddf05dae65f",
    "frenzied_boar_lab_melee_attack_down_atlas.webp":
        "6a9ceb0afad81d97c5bac00e041a8719569dfcaefa111a9f0175f0e740528dbd",
    "frenzied_boar_lab_melee_attack_down_atlas_quarter.webp":
        "b6bd4349d3cf45eb35cbbaa38792f6b67ae472ec51c6b7cbe2b2d67abd34fca6",
    // Mini spider: complete registered death cels, 2026-10-08.
    "arachna_spider_lab_death_atlas.webp": "351f780e04f9ac47a9dc92806dad27f5cfd2c2cdfc2987b8e28d6f34c387c2e3",
    "arachna_spider_lab_death_atlas_quarter.webp": "4d92b1f691b323de8aabadd4ca113fa3612d8ddb39420dc3c4ba996ea31353a2",

    // Champion full-cel hit and grounded death, 2026-10-07.
    "champion_lab_hit_atlas.webp": "291823683a989fcf325d0613eabad8cb816aacee970d295f7eeb81270b8c5979",
    "champion_lab_hit_atlas_quarter.webp": "a775d44f352692f795052d3d7115189c01c90ae5d536a7cfc0ed2148aefb71b7",
    "champion_lab_death_atlas.webp": "f23580e917977e59be862c5b2c4bc31621319a337b3ccccec6814e9b330983d2",
    "champion_lab_death_atlas_quarter.webp": "0935f23f949b24ad3d32a463e2acefbc6f3d14c4c8ba80fe97cb24ab44a74cd7",
    // Thunderbird flight calibrated and selected for the developer animation lab.
    "thunderbird_flight_walk_atlas.webp": "e9cf25a1521e3cd6ebb5bd4cc40a73141270375124e910bf268d08444e3cbb0d",
    "thunderbird_flight_walk_atlas_half.webp": "41e5b7ca0d2a54aec0dc5dfa262e94186d6977b9a0134d6e3262f276792fe587",
    "thunderbird_flight_walk_atlas_quarter.webp": "2ab368fa427c29f3e05f143573a0089ead6d0889d2811a93a4c0674bcf9b9bf0",

    // Magic Dragon reactions: restore body scale; never fit to paw spacing, 2026-10-14.
    "magic_dragon_lab_hit_atlas.webp": "5e3ce3a16c89519917e0ec8561005d0865d27dd8233d9fd14daf9270338cfdc9",
    "magic_dragon_lab_hit_atlas_quarter.webp": "6354f6fb139d1d527f88a04011c2dfb543939bedafe1b717c2bf1cee39ff2eb5",
    "magic_dragon_lab_death_atlas.webp": "6bd7c28c6d906dfb5549e8e51d68397763bb51a750c0a566c228d46182c33551",
    "magic_dragon_lab_death_atlas_quarter.webp": "182d5217fbf2b4df2977e8481755af7422d22ea3a4e3c2ce06077ec644c4949d",
    // Magic Dragon source-registered idle with wind, gemstone glints and ember eye.
    "magic_dragon_lab_idle_atlas.webp": "36031c7ec70b39ec9b8af282dcc569c34b1b0e2107c32dc5ebde7931c1bb19af",
    "magic_dragon_lab_idle_atlas_quarter.webp": "626ffeadfa5d1861da3b007ec252bc2375563b392fce1afbc991e922c237c16e",
    // Magic Dragon flight selected for the developer animation lab.
    "magic_dragon_lab_walk_atlas.webp": "88acb27e1421b7f1161d12ec3bc817997d3cd02583194a26ea2aeab9113b3570",
    "magic_dragon_lab_walk_atlas_quarter.webp": "87ef6f7d8740ffe1e761daf04d0013e9a89e3ff24c48fd8d0e47feb30d6e7707",
    "magic_dragon_lab_melee_attack_atlas.webp": "b86e6f77a1ebdda930c171bc9a85f0509e49905d50e9a40837d7cec8ad9b02e4",
    "magic_dragon_lab_melee_attack_atlas_quarter.webp":
        "75f17f2e8855e0f17c12944591faba51276128012d595ab5d8311dbcc20286ca",
    "magic_dragon_lab_melee_attack_up_atlas.webp": "3337c6779e8652138e8a92092d128d4060a2e794a709edc38fc3b5e77b38200a",
    "magic_dragon_lab_melee_attack_up_atlas_quarter.webp":
        "c8571c264ef4228b1b80f10c79ffb32954499a8d77919bf31d75c3c4ff8735e3",
    "magic_dragon_lab_melee_attack_down_atlas.webp": "37a4de40220c651eabf658651221582fb2cc53856f521416621f0a7541d35bd9",
    "magic_dragon_lab_melee_attack_down_atlas_quarter.webp":
        "13e0da5fb9a4833018294590e0ceec3ee903eb195660e394c538a246baa474cc",
    // Rainbow cast reuses the exact upward attack figure; authored light is composited behind it.
    // Common above-flag result sprites, 2026-10-15.
    "vfx_common_lucky_pop_atlas_quarter.webp": "fae053f7c519fac4c5e97e6abc341e4892ba6627d2086d927d920b311b464f94",
    "vfx_common_lucky_pop_atlas.webp": "a82758343e94166a649a20ea436569bec60265134218eb4d1efda562e03c5c70",
    "vfx_common_miss_pop_atlas_quarter.webp": "4e2c5e59c8598b41e01d364a8f38f063ba6671bc7de2a8bc99209aeb44b1a7c9",
    "vfx_common_miss_pop_atlas.webp": "cb8fd0c1b30632befa2d35a9db8acfe12c677c3effcbe89425910891d9e0eaa2",
    "vfx_common_resist_pop_atlas.webp": "a4a261e808163d5a9717eb71b83f8aee1827657eafa0331629b4ea0169ddb360",
    "vfx_common_resist_pop_atlas_quarter.webp": "f9fac52b1e87194ea04511c9764f3eff3ad41379cc36bff7fac80a88b54b5005",
    "vfx_common_heal_pop_atlas.webp": "78ba09ada76e828c033ecb250c6827c3853da67e3f8dbec9a472298ee269c50a",
    "vfx_common_heal_pop_atlas_quarter.webp": "e4414d0a1a944ea88a48bf97dafcd7dd4ced53014e2d84f2a295d90491e5a80b",
    "vfx_common_absorb_pop_atlas_quarter.webp": "01ee6848963416dc25dc192b916f94ac9d8e7982ec5c0b2ccc0ea21f44d2d52e",
    "vfx_common_absorb_pop_atlas.webp": "ed53c1d8d86bea3e9e988d39fb2b2ca0f7b05d2ce81bdddf09a0539d34ca78e5",
    "vfx_magic_reflection_pop_atlas.webp": "2e17c6243c9560de101cfcf9e4e389d20eec26e4fbb18db025451e54968e815d",
    "vfx_magic_reflection_pop_atlas_quarter.webp": "2c72752d56c9d8723c02a7c1a38a7acd208615e12225af0b1c22ac46b160aa0e",
    "magic_dragon_lab_cast_atlas.webp": "50b18cebe8249260eb7a53c79ddcb660b9107c44fb3a7137885fde24793f137d",
    "magic_dragon_lab_cast_atlas_quarter.webp": "9c75c5ace5b200ab5afc9a15595f7d29fe7ab5176a0d77c35bee96fc9a0cd972",
    // Angel flight approved for the developer animation lab.
    "angel_lab_walk_atlas.webp": "086185900d4ff286f8ba0e18ac6b54bc99c229b170730ec3086cbb98eb8ae38f",
    "angel_lab_idle_atlas.webp": "15f6ffbaa03ce21f393da0cdddd922843423c2169a46ec0eeeeb9ecc57630783",
    "angel_lab_idle_atlas_half.webp": "4cd73b20d4f4b037493e8dae4958f33ba59074e721885a755cf5ac6e1fa0bf62",
    "angel_lab_idle_atlas_quarter.webp": "4acb93ff5135d5a9e3ea0bbe1b5973583b9d386c4b1b9abf13728ccaacd1b994",
    "angel_lab_walk_atlas_quarter.webp": "1141932081fec3fe513c9b4823c1bd880a488700054f6684d95dd1c8881804ab",
    "angel_lab_walk_atlas_half.webp": "511f978703b44a13590c8087ecf705254a06452a5217723d1cb1f9f91c5ab043",
    // Redrawn cannon idle and source-exact walk for the developer animation lab.
    "tsar_cannon_lab_idle_atlas.webp": "acee301753f4201d2da85fe34e5a0a3dc8c0605ac8e497a1c4103a6727605284",
    "tsar_cannon_lab_idle_atlas_half.webp": "e81e635bc00d394ace58474770aa973d73907836d42fb4867100816ada47b56d",
    "tsar_cannon_lab_idle_atlas_quarter.webp": "5bcaa82f96e316de8ce71d70e56b032941560463584fbe308483fba7295e84dc",
    "tsar_cannon_lab_walk_atlas.webp": "449785cd4f4268a59467be3cdb588f8d57e0859b7ae3eb1b74065f87b4b8c0c4",
    "tsar_cannon_lab_walk_atlas_half.webp": "38f01b15d50bfa27b1cd9ed18edfdf0fb7d46b182f7193329e7a6d1c046c1224",
    "tsar_cannon_lab_walk_atlas_quarter.webp": "351a8a97392a84563cf527d55393eccdd3fbb2999023bdaf5bf13efb1f95039f",
    // Black Dragon flight selected for the developer animation lab.
    "black_dragon_lab_walk_atlas.webp": "54caf32d676475ee065dc217bf3204cd669ce13381e48d34406ae9b47896d1dd",
    "black_dragon_lab_walk_atlas_half.webp": "29c8af0c2f270c6e518c52fec816cee8885d3adf9966f0def11c7080fd2b2b4d",
    "black_dragon_lab_walk_atlas_quarter.webp": "2e95ab5f8b2c8fd253dde839257bae835d35d08949b21ea9a87310d5869a6eb3",
    "black_dragon_lab_hit_atlas_half.webp": "c0a69a9f609c4f672223dcb41038b2d624fedbbcc0c60e695020988e3f98fced",
    "black_dragon_lab_hit_atlas_quarter.webp": "f6d1eba9b92c137a94aab9e25b3066d2863796793a55b11dbd9a209d2a8c4ec1",
    "black_dragon_lab_hit_atlas.webp": "b82fcdf304e9e78fe0d48c4bf2c61a9ad7e5349f4b53944b5fac4f120713d9c9",
    "black_dragon_lab_death_atlas.webp": "8824bdca57e712fee8e130238fb4e2d60ff20c7504a0574f18bc3da1f9dec07f",
    "black_dragon_lab_death_atlas_half.webp": "d4f584f8a56acd53e7021ed3d91cae957856280d82051ea9058a017432ddc404",
    "black_dragon_lab_death_atlas_quarter.webp": "d2957f0147b5c652e537907a180673a7bbd1f52a7e7dc21f5a9a9f45a606d1ed",
    "black_dragon_lab_idle_atlas.webp": "99ed36d4780c68f3ebf632374d4d3ff7f38629a7435f7045d3940cb6fa47b808",
    "black_dragon_lab_idle_atlas_half.webp": "51394b19387ba19ae369a4237885e3556f1efac45d387c961044077d2ad434bb",
    "black_dragon_lab_idle_atlas_quarter.webp": "9b975f41dc7f81ef1188356b9d4d677547204e12aebc45c5bc63a8e363a5123c",

    "abomination_lab_melee_attack_up_atlas.webp": "faf01b327ab544474e5dbc28735e1d9fee2ae0331f84258814792ffc6ffe12c6",
    "abomination_lab_melee_attack_up_atlas_quarter.webp":
        "71f2e8c77344fcc9ae7d8fbcc9a858afa64c34dda3c7eecc4d3990ed7fd83060",
    "abomination_lab_melee_attack_atlas.webp": "73084b3dafe9ff1a25dffa6032e3ba3cfe6f8d14daedcfc951ac8e5e40929475",
    "abomination_lab_melee_attack_atlas_quarter.webp":
        "d64650ff736f542c24ebfaa84e2353dd431016e609713f36ba697e6f271b79da",
    "abomination_lab_melee_attack_down_atlas.webp": "759add0dccd9bf8261c3cbbdb9eab2d3aa8c1b2f486826841b9691a7eb3b2ac5",
    "abomination_lab_melee_attack_down_atlas_quarter.webp":
        "1b1276e65e94640c4546b06198c1e12adc79a36da883808faee74873826466e9",

    "arachna_queen_lab_melee_attack_atlas.webp": "f64300937bc393ce0e924e9d1192609c6c4b30b65ded1e492f73b8b3d988c149",
    "arachna_queen_lab_melee_attack_atlas_quarter.webp":
        "cbaf42cc56f9f3982cd0502d4da8892a6f1897991fe9d7ef97063eb243252cb7",
    "arachna_queen_lab_melee_attack_up_atlas.webp": "a137d6d1a6f55104d79eee5992baac1dc98e2683f36d9ea2ec2b451c9e52b377",
    "arachna_queen_lab_melee_attack_up_atlas_quarter.webp":
        "977402dfe06679fee76a1310e81a49d6b131b2e445f5516ea98269614597701d",
    "arachna_queen_lab_melee_attack_down_atlas.webp":
        "ae3e9171462bce3bfa13cfbdcc0eba33a4b971751a5cfa515a146ca5d21ac6b0",
    "arachna_queen_lab_melee_attack_down_atlas_quarter.webp":
        "80000c76253a7bf39ba1ad67fa29c0910cb7b2ff0e5932a1776bbe830570f8cb",
    // Pegasus connected combat poses with fixed canonical scale and padded canvases.
    "pegasus_attack_atlas.webp": "d06ff141afd4d025b39090ee65318e53bb8bc85dbb84543de929ee3538ff3f18",
    "pegasus_attack_atlas_half.webp": "d9dce5fae9ea0df8c3e854aa5ad0b739e361ee72554c03ec706fd39a346e7a42",
    "pegasus_attack_atlas_quarter.webp": "cc67c100f9c4cd6ee46aef26870a4e8a10255459140808ef6165e45f4c672bea",
    "pegasus_attack_up_atlas_quarter.webp": "bdefd148d8f0e2da6d47c855de311eab5f834c1a306c217dc4a328fd96fde8ab",
    "pegasus_attack_up_atlas.webp": "2f877436700a33295a4d58bea4670b83d9e0450615c9cf9c46d3086836b425c4",
    "pegasus_attack_down_atlas.webp": "966b11887d044726d7037cb466510f0376368e79065455c7a197a8602813871a",
    "pegasus_attack_down_atlas_quarter.webp": "bf90873265a94593c69c0769afb6f1684642dc1d4fbef941b2121a7611ff7549",
    "pegasus_hit_atlas_half.webp": "d936adde2bdac86320b7d16a0f96d37dfc5e3c27b42c436c263a0f3c55a15bd3",
    "pegasus_hit_atlas_quarter.webp": "45c50f8c8cc9dd360424c1ebd9922046bbdceecb46e786ba946b98bef6cceda1",
    "pegasus_hit_atlas.webp": "69c5485aa0935d28c27b0ecbfef94fae2c153cc8bc967ef4c4b94635bcb5e01a",
    "pegasus_death_atlas_quarter.webp": "6c18ab4fbd10cfa59146f5f24bfe77e37f429cdb591007d0de3f8b0ae02d08de",
    "pegasus_death_atlas.webp": "7c1f96edec54ddd070da9bf056b2f241dc09800bf8277ddc54125447e86d55d4",
    "pegasus_death_atlas_half.webp": "4340b5a75b37df30667790f2c1e2727b8c8727249837532bb3bf80270e8cc5a9",
    // Pegasus planted hoof registration; connected wind/breath idle accelerated 1.3x (4.31-second loop).
    "pegasus_idle_atlas.webp": "49baa03edae5e4f920bcd6308e802d392deb8c9301f5244072f79814f8842646",
    "pegasus_idle_atlas_half.webp": "6f2b29f778c0c31be0a9a8760fc08c2ac3843cc3c94eff1e1db7ff8c753c32bb",
    "pegasus_idle_atlas_quarter.webp": "fd90ae9f9d9ff7ccc5ec0787f497694a1e194ed7d82280ad33b6af9bcc9148e3",
    // Pegasus flight v2: palette and skeletal scale matched to the actual in-game idle figure.
    "pegasus_flight_walk_atlas.webp": "2b2b25b3cda2cefdaeb30c1bdc546363d0074a53c5b27c5f8f41bb126c0136fd",
    "pegasus_flight_walk_atlas_quarter.webp": "473e207345583765bb90df86176d30fd3e06a9f867dabdaf18702a96232be48e",
    // Approved Griffin package: keep idle, flight, attacks and reactions on the local release.
    "griffin_flight_walk_atlas.webp": "7098fdb01e77df4d3052bc1f04464d42f246d15239a2c4b8f3d77de3370c361c",
    "griffin_flight_walk_atlas_quarter.webp": "198d30ffa2cb33bf74c8f8ed125839a25598f4dd2f41d91875b9b5e58dc8076d",
    "griffin_lab_death_atlas.webp": "352a90e82e0edd07e7ed4ee61129dcc742c3f913a274e1c59de3545bbe1c4587",
    "griffin_lab_death_atlas_quarter.webp": "d566f174d5ba96274ef99f741a8d23bbd1aed66f18743122741d629f2999e982",
    "griffin_lab_hit_atlas.webp": "a77ad25cd2f36d1e2ecb4e0e9fc6f200dbe53b57cb915de512801950071ce4cf",
    "griffin_lab_hit_atlas_quarter.webp": "44dd44adef02f674ecbe7331e1abe671264f4e0f81d986fae6beb04173f29a72",
    "griffin_lab_idle_atlas.webp": "c142879aeb3c5f36df3ae325d803f6b87f29aff7fba99835532451c6530d1618",
    "griffin_lab_idle_atlas_quarter.webp": "66308116bc7ccb4544798854cf7a019b35858a9b7ef162f44219367b3a7d21db",
    "griffin_lab_melee_attack_atlas.webp": "209b0db3fe4351fc13d63cce15fbaabfa40556e8bb07fb4660c91a2541962f88",
    "griffin_lab_melee_attack_atlas_quarter.webp": "0fc9e131a2ddc3dde5c8646bd69fb0dda7969f39577ab2214e3b364484e7e90a",
    "griffin_lab_melee_attack_down_atlas.webp": "ac55d5a3ac01a07952a0fbdeee08f28ab8d42819b96b9c642ac46a55207e7307",
    "griffin_lab_melee_attack_down_atlas_quarter.webp":
        "12b2a25a8bd7d13193c1c690a6f9b734ad120d48545120d368acb0a03cfc9806",
    "griffin_lab_melee_attack_up_atlas.webp": "94174d1708a0623bec74a7d8e725a30232d34f9b4c3a45a275983747a36b875d",
    "griffin_lab_melee_attack_up_atlas_quarter.webp":
        "10d91ee3dd7f0c934b968ea18a90c620c30b8925b8cd0bc36d48b6d23b17b034",

    "arachna_queen_lab_walk_atlas.webp": "8d0597d76c588e1a40deff4e6ca6309c26fed52b6e47431ca5293460afa141d9",
    "arachna_queen_lab_walk_atlas_quarter.webp": "2788e663eb7ff5214a6e03e2fb4ccb7dd4450031c302773d84eb242cd3ff1a7d",
    "arachna_queen_lab_death_atlas.webp": "316da38798466a513aa719e5a6e24155aacd5007ae57a7ff82118732c00b222e",
    "arachna_queen_lab_death_atlas_quarter.webp": "348e0f7360da11de6ffd861655eeca8a571ca805052e0638d6266fb1d3a7e77a",
    "mantis_lab_walk_atlas_quarter.webp": "0785b538db19870c4ef93e04d179b67d1757d2a0d9dd53c49d402d1fb9fef221",
    "mantis_lab_walk_atlas.webp": "de560e8f9d51771d3dbc4e91e2a5d21aae16498c67d0250dd3b9d6a0de5e9ef1",
    "mantis_lab_hit_atlas.webp": "f33a2d3598369b4bea80b9fdf45df15b1b2d5213ba9cb4347e911306300f3884",
    "mantis_lab_hit_atlas_quarter.webp": "f5f894cf0526f68986e19a01a6c1addd87a01240b189d4537d0efb2e22c2e4ae",
    "mantis_lab_death_atlas.webp": "ee949c25f072c6e06db2a2165cc2c7fbc3ed6deb05ef89156876f20aebd3ccc6",
    "mantis_lab_death_atlas_quarter.webp": "209afab0f90b66767b063e8b10df7f859263195e570d4137e23a9d25c7123f72",
    "champion_lab_walk_atlas.webp": "7988e22411ef51c8c8ad4105040f6345b783de417d430478d1e827c46de1d344",
    "champion_lab_idle_atlas.webp": "abd004728b36d93e091365588a20086619148537262849a13e6684d898d67cc3",
    "champion_lab_idle_atlas_quarter.webp": "126a1a5fda9c3f5c78df68d6efbf8598e4427e3b5157615c393f8df0895ee09d",
    "champion_lab_walk_atlas_quarter.webp": "c966fedc41c06d49936594d69a4c5b9dc3d76f675438452dde71015321beeb2c",
    "hydra_lab_melee_attack_atlas.webp": "fa2211b993eef9e68b018a64e0b16fc0335fb1060aa1b52b73c4ca216ed47681",
    "hydra_lab_melee_attack_atlas_half.webp": "7099eff1bfeef6986371b683168059f5aaf20a9e9254f63092693c9d560dced4",
    "hydra_lab_melee_attack_atlas_quarter.webp": "c81d02616788a541dca978e7ad53b42be3f813d34de8d2021e582e271595f62d",
    "hydra_lab_melee_attack_up_atlas.webp": "1f521fa3598f81e88997095e00351614350243bf1e9899935e485c42e2db83dc",
    "hydra_lab_melee_attack_up_atlas_half.webp": "b32499c9e334a03915d3a657fa1bf77c7d218429b982cf91cf76c40db2816c40",
    "hydra_lab_melee_attack_up_atlas_quarter.webp": "c1b8f4e8816f81dade99d470cf367f26a086463c154efe12088c581bd9b06d2d",
    "hydra_lab_melee_attack_down_atlas.webp": "ea7d1bde015858e47dbf0231817baeeb513ba3ce9c841c59b725aab6e0e504cc",
    "hydra_lab_melee_attack_down_atlas_half.webp": "01b6e4375979e4e38160c982ea434c47fca98f525711a5591f412979ed689d3a",
    "hydra_lab_melee_attack_down_atlas_quarter.webp":
        "dc48f11a18a70f05ada68fec9286282d0d0169e1baf508b02bc3b503295b5556",
    "hydra_lab_hit_atlas.webp": "cb6a1c92b2a67592db79108f1b0b9860e599bb9eaf8d0f05fe5372497949aa6b",
    "hydra_lab_hit_atlas_half.webp": "36fe5a3d1d8ee70c373c55e3108087d7cc8cfed448507a2e4b9a3f8ba8466dfd",
    "hydra_lab_hit_atlas_quarter.webp": "28017e054c8aaff5ff99658e2a81304a23289c3cb3c081f6cc208cf641982c9e",
    "hydra_lab_death_atlas.webp": "d43b1869ae3b40f0d93778b20d24e9dacd71e319083315e236890a6a16e3c4bf",
    "hydra_lab_death_atlas_half.webp": "6239d3c241ede2aadc7453c69d0f502805c898064b01f7837f9c29d84b649c7f",
    "hydra_lab_death_atlas_quarter.webp": "458c41a235fbdd7a2f916a75975b0eac8e11e0e4c4205e223acf5b69392baa1e",
    "hydra_lab_walk_atlas.webp": "d2647ef98b72c4be02d2541062e1e1165adc53cdac1a4950dfca4f911a7be9b8",
    "hydra_lab_idle_atlas.webp": "722ff717a9b1fde8b99b04aa709a5bd00b1a06d24b25379f247d88abff8f3770",
    "hydra_lab_idle_atlas_half.webp": "67a2eff99bba6e54afeef30f41c4dd6cc8d5209a35719291f87585394013fd75",
    "hydra_lab_idle_atlas_quarter.webp": "c3e5dc87757e4536cdc676038358ed661d34693727eebed5f11db1e67f098e45",
    "hydra_lab_walk_atlas_half.webp": "44ff10b91915e1e1b5cc1ddc672234b0cd0ee7d783fb182edeac07adb2711120",
    "hydra_lab_walk_atlas_quarter.webp": "b286eb7f5da1e1dd6f5feace0ede5094f9a14c78180ab3c7b3978cbc644d956d",
    "frenzied_boar_lab_hit_atlas.webp": "6d94502541e5d044b1ecba97aa52a717dc317c5d50e27eeb751014716ab217c0",
    "frenzied_boar_lab_hit_atlas_quarter.webp": "eb166cff3746fb60bee01e82db89f1e85855b1ddb2b5f7ddc88c76a930528956",
    "frenzied_boar_lab_death_atlas.webp": "fbeb06daa25fa7dc30c883f5f0b1bc9ea38876b4e206604f7b437ef374dc2cf9",
    "frenzied_boar_lab_death_atlas_quarter.webp": "05f8aaac8377699a221a45a5f2046d6dbf3e60993a35e742a6d53857fe60f269",
    "frenzied_boar_lab_idle_atlas.webp": "7a8285399324623fc3b096b18419a570d46f732e752dd18a9101a9fd0bc8f181",
    "frenzied_boar_lab_idle_atlas_quarter.webp": "dc396a48b197d7af92677adc67dab2d855354649e8b0e40e557ab5a80205ca67",
    "mantis_lab_melee_attack_atlas.webp": "de3218c9be837b3a1c1141e616430448e563fecd39984c0daf649780240c9cb2",
    "mantis_lab_melee_attack_atlas_quarter.webp": "8be9944f6d1f7b775cccdbc154c1c3589c000b33df707b23308268ec2b8322bb",
    "mantis_lab_melee_attack_up_atlas.webp": "8760c16eda1a4075dc648b5b269b87028bb0b914ce288d036abe40d4e868249f",
    "mantis_lab_melee_attack_up_atlas_quarter.webp": "8daa0e7014d56a1f6b5d8abc7fea444021c2ee9fe1619ad685665b7dec8e9d97",
    "mantis_lab_melee_attack_down_atlas.webp": "acbcdac36a0250d0b3f33b205a98db675b03034e5b1a6d9db03b22e6bc70f0bb",
    "mantis_lab_melee_attack_down_atlas_quarter.webp":
        "fa5d321bdcb9d8f45c169900d03a5cec41d1d20fd9945c2b74354a1b7e613998",
    "behemoth_lab_melee_attack_up_atlas_quarter.webp":
        "7691b5db8d133427e26a44a55b2145c59eb4cba2512776f8ebb7dd20ac89ffd7",
    "behemoth_lab_melee_attack_up_atlas.webp": "a2c2a53825f626d65d6e9f69700ebbe3344ba6e8ea51568dd40a47341ecd09d4",
    "behemoth_lab_melee_attack_atlas_quarter.webp": "3539db9a0a79586e9a304e783ac7807458a0b04723966f5c3c79304219090deb",
    "behemoth_lab_melee_attack_atlas.webp": "a677a93aa91a497d615379a2695b6e5a1a58c6cedfaec61715f8db3b7db5e944",
    "behemoth_lab_melee_attack_down_atlas_quarter.webp":
        "4a0522b79f9bdc54d49f31ab05e167a755eb4d3a2cfef243edfb0f2aab84067b",
    "behemoth_lab_melee_attack_down_atlas.webp": "5df2aecdacb316d862dd4a752327ce16220234dfc8ded505233747ad6f8606ad",
    "behemoth_lab_cast_atlas.webp": "1ed2832057d13885a5cc4e6368cee021deb1e2afc8c777690b140a18bc402fc8",
    "behemoth_lab_cast_atlas_quarter.webp": "a4feda2e7234f87914f0fe9faf5b616d6a72b04f6027804ec849727170cf25f1",

    "vfx_battle_roar_short_atlas.webp": "949bb8bca81e610e937bf910eda0b14959a3a7b148b15372f4fb558521175f50",
    "vfx_battle_roar_short_atlas_quarter.webp": "9e0c23b6ce3ab34096a52c5908a8619e96ba6f0814ac3197bbabea986bc14c09",
    "vfx_battle_roar_long_atlas.webp": "949bb8bca81e610e937bf910eda0b14959a3a7b148b15372f4fb558521175f50",
    "vfx_battle_roar_long_atlas_quarter.webp": "9e0c23b6ce3ab34096a52c5908a8619e96ba6f0814ac3197bbabea986bc14c09",
    "behemoth_lab_hit_atlas_quarter.webp": "631055265b5229be5a283377f2c68240ef3bbc7bf70577fb2c3f5f8bb4944c89",
    "behemoth_lab_hit_atlas.webp": "5d27792d0af6871d79d7beb57dfa302055e61bddf7365fb3a1cc927d150b21b0",
    "behemoth_lab_death_atlas.webp": "df1eb9584fdda76ce8bdccde6fd352e9994e6ad4368b9df9ac9176682f1d12a1",
    "behemoth_lab_death_atlas_quarter.webp": "1f44bfa3b3fad9b5237cbf58dbab80570e2d92e9298604ea096f2a2e6cd31c48",
    "behemoth_lab_idle_atlas.webp": "ab24b32a0ed8f60372035bd6eb67840d1cfdc76fcdb76c85def251484081d841",
    "behemoth_lab_idle_atlas_quarter.webp": "d87cb576108c51a8e797ae0f6480d20e2acb78fff4152081894b56da0f586c51",
    "abomination_lab_walk_atlas.webp": "a289c566d59cf2cfdd6f6db6c95d9003acde73a33359d663b5ccbc61620d82af",
    "abomination_lab_walk_atlas_quarter.webp": "2499f79ddca6c1f5b7900c59c945ee21d1ce3e3f59ad7be6a3aa361db4801c2f",
    "abomination_lab_idle_atlas.webp": "0d3caf781c118b23d08eafa2d8067976cdaf52515f0a983c9e55eb646d76833b",
    "abomination_lab_hit_atlas.webp": "8ba58acc5f5fc6b1adb0d138b3fa9c751c34802442c07b5998f6d6c17fbfb2bd",
    "abomination_lab_hit_atlas_quarter.webp": "0cafbdb0ac4a26dfa92e942ad19c829a2f9262748cb169f160fb37757c022b73",
    "abomination_lab_death_atlas.webp": "957d4119779a1266fe6dc0cf9213dd34e0c81d20ebd272e4181aa5d19ac7e97c",
    "abomination_lab_death_atlas_quarter.webp": "89c9a58073362320af8f340ee9cba5c450b7bf5c4b10f6d507126f0665b7276c",
    "abomination_lab_idle_atlas_quarter.webp": "b724f20e9fd3f5f3b480435da27ac33796d34272890a49226fefc5fcd88f8c0c",
    "abomination_lab_idle_page_00_atlas.webp": "40cfefe2206babd26d8cd4d362baaa5d6d4ca04a1d088d9d584c7cd3dbb4669f",
    "abomination_lab_idle_page_01_atlas.webp": "04d97263213d85553d7e4d1b85acf10df1759674c5a71ba5af7d286d352de277",
    "abomination_lab_idle_page_02_atlas.webp": "d1a8af52a28b4f0b35a47bc0de642d86f9b2fde8004ce3b5dd1668a98b5fca77",
    "abomination_lab_idle_page_03_atlas.webp": "87ecbb7c24b055fb9fa9dc5e2e9f6a82bbd0b40b217a168e517c66eb56f8ba70",
    "behemoth_lab_walk_atlas.webp": "98892f83e6e82da3d2e103f29813fa0e6a7ae0d91a5acfa2632d91ffccb845d3",
    "behemoth_lab_walk_atlas_quarter.webp": "5619857ee7c5f5b35d048468790d98e45bdea1b12549ea37e39b6265aa82d784",
    "frenzied_boar_lab_walk_atlas.webp": "267d0061b7b9f23e5965d2a56d2c1336c0e215b624eb474183ccd0971f5c4b8b",
    "frenzied_boar_lab_walk_atlas_quarter.webp": "219d14d2d77faa7fec1f0b9ff734ec89cd7aa04c6217b826ea25969fea6cbfe1",

    "gargantuan_lab_walk_atlas.webp": "626748017bd92150643d7b92c10d95228064bc9485a54e90b4f95d87df003dd4",
    "gargantuan_lab_hit_atlas_quarter.webp": "6360a5b07b2ce4a43ce2f2368db2e4d5b6fbd2122b0ac7ccfae6f4fe898e5c0b",
    "gargantuan_lab_hit_atlas.webp": "41a515feee252116e954ceba4809841e1731c0e4eb9e1f7e8d3b43b7a61acee0",
    "gargantuan_lab_death_atlas.webp": "64d4bd6c3ee9c9bb8cc442a6136e2bba1d9ef8b9448787eac267b5ef017526a5",
    "gargantuan_lab_death_atlas_quarter.webp": "4e4f1f668131d49659e983a998912c76a1b11610322684ef9a30f52e4ad362ce",
    "gargantuan_lab_attack_atlas_quarter.webp": "f154f5c6efdb43f6f635732b43ad065ba1ea00dfe14edd8ce792fea5713e010b",
    "gargantuan_lab_melee_attack_atlas.webp": "c35848879f19b6de79f6f70851fc9e29ef43ffa60f06813a27836cf113f489f7",
    "gargantuan_lab_melee_attack_atlas_quarter.webp":
        "57c92093b6af5c5465545a9a277a040c63526a3b8dd203e9a84945b9f524a515",
    "gargantuan_lab_melee_attack_down_atlas_quarter.webp":
        "2c17a6cdefd95795a76d01bcf5fb2670b76a5d18546cdcb174dd69b1abd69ea0",
    "gargantuan_lab_melee_attack_down_atlas.webp": "eb19d860542a2ea102199ad2c7111cecebc792ade3634b7a8c4a4e800470dfb8",
    "gargantuan_lab_melee_attack_up_atlas.webp": "ba8217242b8f4eafaeed5d7540aadaab97cb90e39380d78880496304066fcd77",
    "gargantuan_lab_melee_attack_up_atlas_quarter.webp":
        "9b3c5cc62efe48605141ae910fc6358981ebf19914274a2376bf6b3e7bcfaeb7",
    "gargantuan_lab_attack_atlas.webp": "75b407003067d8d3ebc7418fff3f88d077ac6e03500050bb40158055c6e0c130",
    "gargantuan_lab_attack_down_atlas_quarter.webp": "a999946256a31b64e847c4a2200d5c03f82ef6d8afa7655408854fd0b457faf5",
    "gargantuan_lab_attack_down_atlas.webp": "21ec7e445ba41c15ec3a2248bff1f4a0021ed51a1dc1297648814438383ef382",
    "gargantuan_lab_attack_up_atlas.webp": "d4dfb706758baef04c8bd6ccfb670386b25faf33a778570594579d522ad705b0",
    "gargantuan_lab_attack_up_atlas_quarter.webp": "edbbdc84dacdd5260a9ef5e3e17d381fb2d568e0ea3ece48dc56bdf4ef328838",
    "gargantuan_lab_idle_atlas.webp": "92917f93955040f92dfade382478295662ca6e323aa93b6e0f9ee1f178cb5975",
    "gargantuan_lab_idle_atlas_quarter.webp": "cd3427dfa08b092b84d0eee5717877b20f277179403b860d255a86b1936fd871",
    "gargantuan_lab_walk_atlas_quarter.webp": "d03d07bc13f55c62b3012cfbfe7c051fea89f450df0da3895b51c5bc74dff1fe",
    "zena_lab_attack_down_atlas_quarter.webp": "5a4e254336d0189c1b8818b8030fd618ea254edaa642c9259e4b296833e17609",
    "zena_lab_attack_down_atlas.webp": "7f077690ab0d9fda458473975a3712b85386867477a0dd6c63822e609b624ff9",
    "zena_lab_attack_up_atlas_quarter.webp": "2dc94a2fe60e294532f40e6b02af9ef98dd2a85a9dd78ce142c7fed13fa1d029",
    "zena_lab_attack_up_atlas.webp": "b5d07df063def9b81afa8160cf7e09f404d1079b780def417b2b19fa8b6bf073",
    "zena_lab_attack_atlas_quarter.webp": "90322d9a0eff9f288db1e8433f23a7c759692019e2c2eaef65f3ba5d52c1b1c5",
    "zena_lab_attack_atlas.webp": "32851fd6e24e562429a29332e51c7d6964954cda9142ee38d9cea3b94b5a0aed",
    "zena_lab_melee_attack_down_atlas_quarter.webp": "573dc74c24d131f18fcb629a079f54724922baa1a50d50d528c605541c5fa066",
    "zena_lab_melee_attack_down_atlas.webp": "1bf91733355248acf8a2373eb728940a110e9479f9370465fd4386cd098d0358",
    "zena_lab_melee_attack_up_atlas_quarter.webp": "805ca517e23b2b0519d17f1e4c0d6e79f2c36cca1d83eb4ed7a7d76808a387f0",
    "zena_lab_melee_attack_up_atlas.webp": "9715234efc63e0aae2c1ae1a8de7f3a46fa9b658f29ff50aa0fd0cba28b5be31",
    "zena_lab_melee_attack_atlas_quarter.webp": "bb475a5222c73e5a02fe2825087e591587c673c190587198f654b7c810cdff83",
    "zena_lab_melee_attack_atlas.webp": "cd1a13471395b67f0fae6e8d793201053214d1cda5ef133a8b9e4555dd1966cb",
    "nightmare_lab_cast_atlas.webp": "781c09c1ec2f61eebf7eac4a07f929a183a22403bdf3fa243fbc94701e3cb329",
    "nightmare_lab_cast_atlas_quarter.webp": "2e540346eed3bd1045decb17cdd534b9a21f1f64c5706b66b857a0c8471bfd95",
    "nightmare_lab_smoke_cast_atlas.webp": "1e61f18a4ea415c2300380938325d00cd7b6dad9f08fe7649b01392518a35096",
    "nightmare_lab_smoke_cast_atlas_quarter.webp": "1b69e582ef52fb2f2db648f7be1e9fda3f8f6bb59bd232824b15a18aa93de2fe",

    "monk_lab_attack_down_atlas.webp": "6613ecc6201fe8a42d8aa3f5a492855597cbc7246d812f0ec70e83e9adfeee01",
    "monk_lab_attack_down_atlas_quarter.webp": "f5de88c8c86156d8fc91e4e2898d1f921550958b77fb97ee4661cf018169965e",
    "monk_lab_attack_up_atlas.webp": "0678314d777d86da57636aa49b140d4000613a61afbf9569161f4972410538a4",
    "monk_lab_attack_up_atlas_quarter.webp": "025881d17f40cd14c89a2099d20ce52d9cd3c9c833e95b04b2f06604acbf966e",
    "monk_lab_attack_atlas_quarter.webp": "ec4797f6b61c1f9579d78341f18ac0a7ddbd2b16ec3552f0930780eec6827fe1",
    "monk_lab_attack_atlas.webp": "b0336790f3eb3832259a3f9fb62f4d9177378025217df11c746812464e1a0714",
    "monk_lab_melee_attack_down_atlas_quarter.webp": "1460dd82169fdf947887495e9222bd09698ee3fd0d8d3bb868fd02d415b26daa",
    "monk_lab_melee_attack_down_atlas.webp": "f6478db2d46879437897e862568d78c4934fa09bb4da638e43e89e5919c46117",
    "monk_lab_melee_attack_up_atlas.webp": "17034e78aa38c0877ce6ab324d985073b730add3be3515a13934de60f3ea2577",
    "monk_lab_melee_attack_up_atlas_quarter.webp": "7b3da4b114f2387d0b7fb4028c078192575af7f949effffe3527087c478390b3",
    "monk_lab_melee_attack_atlas_quarter.webp": "cca80e2598d48a870f23e5fa1f050448fabaee76e89c7b9ec50ac672d187a234",
    "monk_lab_melee_attack_atlas.webp": "74bdbb4873a0a716eb494e887f857f7f75cf3998778c42b6f4c7eccfd267f5f5",
    "crusader_melee_attack_up_atlas.webp": "a52a1a1d76f08ac804687a71a0fb553fbd11ce702f804c77fbafd3e00a63096b",
    "crusader_melee_attack_up_atlas_quarter.webp": "432d31ffeb91410a985ca85ea3b452c0430d678a5a46c709437473f655248290",
    "crusader_melee_attack_atlas.webp": "0768f7bf71e2e9f33daa17f670c64a52c4cd41594739a7d8d395a812627aad71",
    "crusader_melee_attack_atlas_quarter.webp": "bfb31ceefd32e0c9d5916e8ab94946a5fec110eb1af6da497731378982182336",
    "crusader_melee_attack_down_atlas.webp": "122c331746fab9edcb8a01ecec72a096758e07cff416069e4dd479deedc00846",
    "crusader_melee_attack_down_atlas_quarter.webp": "11596ddcc80ccf7ea998650f109324c2a8c350b64319aac93a4b0f56cb3ff059",

    "zena_lab_death_atlas_quarter.webp": "4b7eb2fd1791a7df65aa73df70a93a9451e48e5881f0ab739454ec1495ca01e3",
    "zena_lab_death_atlas.webp": "59b4837d8f0f4bae021589f3d5ecd565e298ca93876203bd2fbf40873b2bc2b3",
    "zena_lab_hit_atlas_quarter.webp": "f44fa9bd18fc8cd6e911302938eb91ad6e865d2f64e50915ed4701024166aa86",
    "zena_lab_hit_atlas.webp": "3890b67495f05003c08cbf6559b6a7d12c239a0a912646a8a60c05026dcbc303",
    "monk_lab_death_atlas_quarter.webp": "68055e200c439001e9527bba57fb7ad477376f482f16ef4fbc3f423fced336ac",
    "monk_lab_death_atlas.webp": "c88af404cab7785d0d7d5f573f39cd845812bc4df35e1698fbafed107c4bd459",
    "nightmare_lab_melee_attack_atlas.webp": "2963285e47b797e929721b11f692ca060ad7940178587a32a9926b3541dcda12",
    "nightmare_lab_melee_attack_atlas_quarter.webp": "dbcd08b2dbb2564d56c0269d33c69246b5f0fa9f15b8133806fc5fd07f0e10ce",
    "nightmare_lab_melee_attack_up_atlas.webp": "8719888effc90f9a0291eed3ca819ac888a2bb87565713e3fa6dc50e12cf853a",
    "nightmare_lab_melee_attack_up_atlas_quarter.webp":
        "d814c4f7ad555d6bcba0c00cdb57674d53d9613791ea176b35df5e386c1de624",
    "nightmare_lab_melee_attack_down_atlas.webp": "a3b5828a4c5adeafad441c0d94760494ba112ca681b118a3db73c9fdc45e5d6f",
    "nightmare_lab_melee_attack_down_atlas_quarter.webp":
        "9d5b3d490a58c73c9b945ec2ef253c88bf3ab44b699534617675e1985854f87b",
    "nightmare_lab_hit_atlas.webp": "c034362458d93d85eedc0fcded3d2c802e91196d7a31d8b67079c579593c43ba",
    "nightmare_lab_hit_atlas_quarter.webp": "286204efb2d22554cd2019059353ff27a0aa0cd8b16cac8b61c5dd0802a4d341",
    "nightmare_lab_death_atlas.webp": "e64d3aca5a8462e14ea05bd8237829448e56dd0334b7d7c05e61cf0a0c11da56",
    "nightmare_lab_death_atlas_quarter.webp": "ee4d4d21258642fabac99975608f7a6444e144507c327552dd9d714e3c6293f0",
    "nightmare_walk_atlas.webp": "c4a20ebddc6de53a394666ba320e249027affee73b2a27244e3e43e3280adcc2",
    "nightmare_walk_atlas_quarter.webp": "f8dc83d6815b5c4fd82d992d6a2870f367379d5cab39f189472a6105e0f79e0f",
    "unicorn_lab_idle_atlas.webp": "ccf35878bc4a701672d051942b47c488fbefd12b851e9a10bc592f295d98c192",
    "unicorn_lab_idle_atlas_quarter.webp": "97c85919ede58d9490f56fe0720ee2dbf51a5ba6b88bef29cab61e7542406896",
    "unicorn_lab_walk_atlas.webp": "566a9f30ca4a8afc3f2cbc14bd5a6faa962f14272951c73a6337939317c5c648",
    "unicorn_lab_walk_atlas_quarter.webp": "80954c9cc70cd57bfadd0693e43926205f7041e6baa116adca7dc466014d4cc2",
    "monk_lab_hit_atlas_quarter.webp": "beed9f6d706e16c41aeb54a87a57fa1111373990afba19665da335c8ab64b44d",
    "monk_lab_hit_atlas.webp": "e5b48e2a82f315e0796481a9054a0c6069737862b386cefcedb566ea97fa0d86",
    "zena_lab_idle_atlas.webp": "8f5bb9042693e0f4afd097b354d0ac639aac3da0ed8d884ecfce168cd056bbca",
    "zena_lab_idle_atlas_quarter.webp": "fedd23371fe49d62eefc04bf4d506997f60a4fa95b676f8adf15555767a81f52",

    "monk_lab_idle_atlas.webp": "491d644b345f888149bc4cd191d67e4a051add922b6e2e185ceab0b77da60c60",
    "monk_lab_idle_atlas_quarter.webp": "c9876afb3d0ba5b51c2b869beb2696cd3ccf4dc9e01cd42d97b993bba990d896",
    "crusader_hit_atlas.webp": "5f8fa92a137f34f8dd3f3a79316019b2edd2ca2533b0bd2cb193fc1ecfe91908",
    "crusader_hit_atlas_quarter.webp": "64d6cc7771882788d47454961729515753ee00fa31db14b6d2e559ad234ae14e",
    "crusader_death_atlas_quarter.webp": "257eb27780503c7486233c13b8653488c815e6feb4a874f62c47f3cb07add8aa",
    "crusader_death_atlas.webp": "cf59aa6910a05e373dbf0288e0dc0541569177540f1d2d94c83887b72c61a579",

    "zena_lab_walk_atlas.webp": "715b5f147dd131458a4ed4522627b1c99ea55a142e9db2b5525edeeae9a9d84e",
    "zena_lab_walk_atlas_quarter.webp": "e2672a5e30889b21d6421088eef8ce042c7a2c07c38b5508688fde89b2aa2948",
    "ogre_mage_walk_atlas.webp": "0bb1472d860d12ef0cc45c05318b3c35d0f24ed145d29207f1f51ce9ec7d69da",
    "ogre_mage_walk_atlas_quarter.webp": "302e1f8cd1de1459cf7c13f46cc549c3f16b7883881d3318bf18771c7867afda",
    "ogre_mage_idle_atlas.webp": "3dcb5d4e5dfb06f73949daac9aa3503e5fba7952ad4046425cb03ac40cf0e883",
    "ogre_mage_idle_atlas_quarter.webp": "bdd65cc41cadc7edcd16e46beef628ee797bfe26b19bdd4bcd7c4d44eec507bf",
    "ogre_mage_hit_atlas.webp": "d5b488ad2e89eb8066eb7e36aba1bf56fa00d4dc90e7b4cee0d862781bd5b7d7",
    "ogre_mage_hit_atlas_quarter.webp": "f0ffafedb81e965b7008d18745c18b6fce4eeb24404cb71ff051e4d6945e09c8",
    "ogre_mage_death_atlas.webp": "ea762214d0d14e2f40384fd6c12c70d3561e85ad18bab62746102a32b3ec4276",
    "ogre_mage_death_atlas_quarter.webp": "8813e21a2c9f4dc6032cb9f7e1704fa782e99e8483bac56eb1e0820fcd91db2b",
    "ogre_mage_melee_attack_atlas.webp": "772a033321bba32268f6622e26dffc5a101cade2dc8d22da0d22a8525641e4c3",
    "ogre_mage_melee_attack_atlas_quarter.webp": "48da26fe7051837bfdf7209c41f2572f7ee65d2bdc1ad7a3b6f9bd513d6b5eac",
    "ogre_mage_melee_attack_up_atlas.webp": "2d065fa40ffe33ae920d60ec30f3ba4323485aacef0df8a64baa1889cc3fd88e",
    "ogre_mage_melee_attack_up_atlas_quarter.webp": "fa13443461b940775df4d413303dd3ab362ff475e8ea16309a1b3075600e8a3d",
    "ogre_mage_melee_attack_down_atlas.webp": "97e2e3b5e7cecaebd61fb26ec569c7aeb0f1cf3a3cadc3de343126a7c715e8b8",
    "ogre_mage_melee_attack_down_atlas_quarter.webp":
        "7c59e944d56aed137675c49ca487a03b4f20a027a108e39209da7f2afd1f3a01",
    "ogre_mage_cast_atlas.webp": "da36d90f4f8cad6ed386db3e2af432c05fce5602ef22ac5831980012805f35cd",
    "ogre_mage_cast_atlas_quarter.webp": "834a712d79a3a6cd1da415e7e8a555385b764c51a33418a48539ac9477cc67df",
    "monk_lab_walk_atlas.webp": "0ac7fedbb560c5abe19a29d1622bac7eee35e1919d92ec4d4750fcf93ce308a6",
    "monk_lab_walk_atlas_quarter.webp": "a33502b26d5b437a7fa4139195482b9f283b60fa0e4db3b558ec40520bc808e2",
    "crusader_walk_atlas.webp": "0b5d82fb400c991b9d44453eda70828259faadb294564515d1612ea879f4fd70",
    "crusader_walk_atlas_quarter.webp": "37949f2e8b8b381d7fcde0c95a000f5e31a2a2eaefdba3d67857cab3b8849247",
    "harpy_cast_atlas_quarter.webp": "b52fc3773b6ff46040b9dd65fbb7594a31148bdec7a8cdb89f6f01804da9f627",
    "harpy_cast_atlas.webp": "9567332fc7ac217e28b5b04978732135b18b3fa3f615f84cf657b6123465d08c",
    "harpy_melee_attack_down_atlas.webp": "659bfd39e094e8dcdb27dce36092b82c93916abf0aab4200f72dc0b1f0e10cf7",
    "harpy_melee_attack_down_atlas_quarter.webp": "6051262e7ea0216b56a1417af24761aef66d90096e724efe78f5274c79fdd931",
    "harpy_melee_attack_up_atlas.webp": "bacce14e70ea2bc0e63cf1f8ddc7b78eaa05b93602abf6c0d803c52c5250bda4",
    "harpy_melee_attack_up_atlas_quarter.webp": "22c3f31e29377262ed4fb14c02cb591751ee9427eb8311a3cb59ddb999cf4b4d",
    "harpy_melee_attack_atlas_quarter.webp": "49cc3d732ebb4f19f0bb3feeec0db8d1d8fe372144f2336e47d62e6756bb624d",
    "harpy_melee_attack_atlas.webp": "f3b69fb30f575e13a0b2fefe2afe776e54b6ae6d409a4f934bc7aeda9c59c05c",
    "harpy_hit_atlas.webp": "4daeea6af5bcaf83f702ffdbec543a4dc3da1c6a3f451265971ae26106ff3854",
    "harpy_hit_atlas_quarter.webp": "f83cbe58ca405e6f5d95a69c4eaecd3af428ce6e8a4a92b0b8ad095daa7e8c0a",
    "harpy_death_atlas.webp": "d59d95d9ff54234ef8605ec872521799865cb4675e9edbb071b6870512020619",
    "harpy_death_atlas_quarter.webp": "7db3a91781a93d65a645ae531215eefdead562f2b2352acf621b95bf6dddba93",
    "trent_cast_atlas.webp": "6b8993536b98bcc81ea04e3be92f621397eba90f88f28b663812ad85b2b5b57d",
    "trent_cast_atlas_quarter.webp": "11e3ca354f2e02c8683ef42cb08b732d51b79ada126197ca83e5390920ceba74",
    "trent_attack_atlas.webp": "0ef439a6cb5d12733c116fc041289f40a0e1ee72c1e6fc86d5bf205922da91d8",
    "trent_attack_atlas_quarter.webp": "a7115b8ae6366515f411037a3f049c7bd7fe1c8e3ca7c0a76b29276d00172a86",
    "trent_attack_up_atlas.webp": "317586bb3f60761189982988a3206cf93ee25909dbc22cba0d3d45654ed9aa77",
    "trent_attack_up_atlas_quarter.webp": "28ddef80e07c9359a548cee58250ad82c5531efc097cba84dd96035d10d2a17e",
    "trent_attack_down_atlas.webp": "a075092f57111a84b635b466bb9ffa1a407bed8e2ad208add5f8c73a9d5ea0e7",
    "trent_attack_down_atlas_quarter.webp": "30af1a77883657e21e34eb165db768ac2dfd824f693f21ae3366e4af30970e78",
    "nomad_melee_attack_atlas.webp": "8d23b7be6aac86352417f356aa0afe1d1dbfc52636a6655069fd9c8d3ab74d19",
    "nomad_melee_attack_atlas_quarter.webp": "e6869eb62d04eaad3bae2572f1e6313e89350c1dd89f16c3bb2d27879b753353",
    "nomad_melee_attack_up_atlas.webp": "573a6b880219578c28ed1a6dee144a835ac2499d5cd5c920f0823b6d200dfc59",
    "nomad_melee_attack_up_atlas_quarter.webp": "b3e5b2ad8afffd83abc19116e516ee5d9a45083105b3074a70e2703f9b994ed5",
    "nomad_melee_attack_down_atlas.webp": "e75bd242572cd7b81779f961b9f277fa2c945a6a73ea962bb06018c13750796c",
    "nomad_melee_attack_down_atlas_quarter.webp": "7c82564ad012f688ddb86d42f6b52b06b5ff27a3dde71ff802528b6ee19334ed",
    "trent_death_atlas_quarter.webp": "ada1bbc62c79757952655fa42f58218e2179ba1ec43cebed2781a07e6e7476d2",
    "trent_death_atlas.webp": "9ea56a528436f40aeee10ecf8b4bfd7712bdefd1dc59a072252ffff8462483f4",
    "trent_hit_atlas_quarter.webp": "913dde6326c186190971bda13ae5af25b472a19bcff8f476ee4d606c587f51bd",
    "trent_hit_atlas.webp": "2db3a9919bd5ad93f77965dcca132e3c5a745f0803ed3766232569636ddcf9c9",
    "nomad_hit_atlas.webp": "02aaf5a85f5dd0bdf0b6738d34059bb00fa5f8748cb0aa527a6edaf6de539de3",
    "nomad_hit_atlas_quarter.webp": "c064f5c84687f058a36ccef1d7a73ae30bb10d3af48276e66d1adb9247be34ab",
    "nomad_death_atlas.webp": "2875d8a3ef53d81415969413fe87bce29d628f80f3ad6eb6d5e9b8a876bdb35d",
    "nomad_death_atlas_quarter.webp": "a5a2969bec29f3fb10b0515257a662b444a44e2b7d4ec3c6961de1ac64641ef5",
    "nomad_idle_atlas.webp": "f683962c33ac7570aadd1dc9245d09b92f1d80c7198e2103f272ddb1f578dfef",
    "nomad_idle_atlas_quarter.webp": "7dd81694c8be173c7d24c6b0d5d77173cad28c84012b94fc890b3d5733c96b3c",
    "nomad_walk_atlas.webp": "e9cbaf73381f330296bbee234ca2945681ec36c7542420b0796e618b434d8ead",
    "nomad_walk_atlas_quarter.webp": "3dc938bac638e02e677416436f41120a25229e4654074a54957968ecd0a6506d",
    "hyena_walk_atlas.webp": "2e243766d3cbf2e577d2567807e17fe967d63d45712b55d09720b1e7bb8e2ee2",
    "hyena_walk_atlas_quarter.webp": "7007c77a03a167f0b5f5d054890a349274805bd3c6271a7e2a532e43ba555700",
    "hyena_hit_atlas.webp": "1df889f04d590e255220189745905c44a3efb746c7b73b13b3b27293187b6a4c",
    "hyena_hit_atlas_quarter.webp": "344909ffd402abbccb07f25dadf7a20078a5c3e4f8e85b50420ea53287068c87",
    "hyena_death_atlas.webp": "dbb3a58b207d0f55e86701683c6584d3259470317bad0461abc7e7230a4fb37e",
    "hyena_death_atlas_quarter.webp": "612af2956eb713b43de8dcd4198ce6a95e7334c81201576f7a8d98ed665bb759",
    "hyena_melee_attack_atlas.webp": "ba76a1492e8b032a8608c01e2452a16f4d33f740337ab13e713c70cca98345b6",
    "hyena_melee_attack_atlas_quarter.webp": "11345e97375e30d7305e502b45afb13e74d2966d0ec62f80f78299f9bfc0320f",
    "hyena_melee_attack_up_atlas.webp": "3e770b1bcd17248f0be6f9de4d96f5faee5ce44804d8e1dcaed2ec489f77c44f",
    "hyena_melee_attack_up_atlas_quarter.webp": "de833b0974de38919907dc717ef780b0e1124579c6546db95889d1584f1305c5",
    "hyena_melee_attack_down_atlas.webp": "a150b4f1caca7f6deefed0f7eecc6509bf641e7d18051e5e37bb480c3169785f",
    "hyena_melee_attack_down_atlas_quarter.webp": "9dbd5e3d2d303577a773d0835751d19dee1130f34b477fd1beefe7a3ef2db8d2",
    "trent_idle_atlas.webp": "d2520e210267197ac7bd15e4d0344d9634e23018c42e7dac094073a61f3f0545",
    "trent_idle_atlas_quarter.webp": "a4a7a27c0059d05e38ebb28662f1f318e3d7e19efa65f6cc3831a553222613e2",
    "trent_walk_atlas.webp": "b079d8536a9b6a9014f78fdba8668b9703ebe7aa087fe2ffb6b0b06a41d83932",
    "trent_walk_atlas_quarter.webp": "495668f5a47d95dde1f8f75eb10a5119720f5dda7b3a8f33d9a0d91c038fe449",
    "satyr_walk_atlas.webp": "77d5c9cd9110127253de543b71abbc22ed9f3096b330b48faec0c3509aa23f77",
    "satyr_walk_atlas_quarter.webp": "bd5ac13110b16d454c5cff9722a10be5bb0cce40f038340256def2f7dd7e557e",
    "satyr_cast_atlas.webp": "3b6078975f4619fa6d972cf6121f1c612246b29712a2832092de3f444ec2ff79",
    "satyr_cast_atlas_quarter.webp": "4556f7f916ae4af634c4aa983009f992b4c75dfe5307f357d76603cc56b85e5f",
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
    "dryad_painted_idle_atlas.webp": "20a57ba7d351f31d1033839148f3e335251b1f3c72b14872063a9e9e4047943d",
    "dryad_painted_idle_atlas_quarter.webp": "47222cc216b0dfd61288a45f40593884cc4199399a3fe668ed36ef8e21d9ebf1",
    "dryad_lab_idle_atlas.webp": "f2eddeb9596567de315ccdbceb304cc58b3abeb7b0e0ca3447c9cb8a93f7a3d9",
    "dryad_lab_idle_atlas_quarter.webp": "942f3ed348833b49209a4372d0ef80c48c75d39f6f6c2630b267ae2863c32dc8",
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
    // Wandering Mage walk: shared material palette matched to the approved idle (2026-10-20).
    "ash_moth_walk_atlas.webp": "907fb47dc006c1c70d37fe0b471001533e907b8b93987dabe68f78519ab20c7f",
    "ash_moth_walk_atlas_quarter.webp": "25889955c25244ef714cd7404a6df4697663f8f1d4dd80b34d1018b929832554",
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
    "peasant_hit_atlas.webp": "e7a70e5bbbcee4c5fff666ff67ff54d07d0dbb133d0f0ed1c33eda311b08c355",
    "peasant_hit_atlas_quarter.webp": "68dae9a288e292a935e0d3fa4837d37e9c7cbdcd4c31fb77e1cf4d8fdbfd5d4c",
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
    "medusa_lab_melee_attack_down_atlas_quarter.webp":
        "82fde3b4783ec1df6d41b2b25db0b561ad81d0281a6b13be687847ce46a4be65",
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

const copyOnly = process.argv.includes("--copy-only");
const rootArgument = process.argv[2]?.startsWith("--") ? undefined : process.argv[2];
const animationsRoot = resolveAnimationsOutputLocation(process.env, rootArgument);
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

    if (copyOnly && !fs.existsSync(outputFile)) {
        throw new Error("Release atlas copying requires the versioned animation_atlases.ts index.");
    }

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

        // UI streaming pages have their own checked catalog and never become creature animation states.
        if (json.surface === "left-sidebar-paged") continue;

        if (!json.meta) {
            console.warn(`Skipping (no "meta" field): ${file}`);
            continue;
        }

        const meta = json.meta;
        if (!Number.isFinite(meta.totalDurationSec)) {
            meta.totalDurationSec = Array.isArray(meta.frameDurationsMs)
                ? meta.frameDurationsMs.reduce((sum, ms) => sum + ms, 0) / 1000
                : meta.frameCount * meta.frameDurationSec;
        }

        // Abomination reactions already contain authoritative one-shot timings.
        // Keep the authored duration consistent with frameDurationsMs in every consumer.
        const authoredAbominationReaction =
            unitName === "Abomination Lab" &&
            ["hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"].includes(state) &&
            Array.isArray(meta.frameDurationsMs) &&
            meta.frameDurationsMs.length === meta.frameCount;
        const authoredCannonIdle =
            unitName === "Tsar Cannon Lab" &&
            state === "idle" &&
            Array.isArray(meta.frameDurationsMs) &&
            meta.frameDurationsMs.length === meta.frameCount;
        const authoredAbominationSandVfx =
            ["Vfx Abomination Sand", "Vfx Abomination Dust", "Vfx Abomination Sand Gust"].includes(unitName) &&
            state === "aura";
        const authoredDeepWoundsFlag =
            ["Vfx Deep Wounds Level", "Vfx Boar Saliva", "Vfx Devour Essence", "Vfx Ai Turn Brain"].includes(
                unitName,
            ) &&
            Array.isArray(meta.frameDurationsMs) &&
            meta.frameDurationsMs.length === meta.frameCount;
        const authoredWhirlpool = unitName === "Vfx Whirlpool" && state === "swirl";
        const authoredScavengerDodge = unitName === "Scavenger Combat" && state === "dodge";
        if (
            authoredScavengerDodge ||
            authoredAbominationReaction ||
            authoredCannonIdle ||
            authoredAbominationSandVfx ||
            authoredDeepWoundsFlag ||
            authoredWhirlpool ||
            unitName.startsWith("Vfx Blacksmith ") ||
            unitName.startsWith("Vfx Ogre ") ||
            unitName.startsWith("Vfx Satyr ") ||
            unitName.startsWith("Vfx Unicorn ") ||
            unitName === "Vfx Aggr" ||
            unitName === "Vfx Paralysis" ||
            unitName === "Vfx Stun" ||
            unitName === "Vfx Penetrating Bite" ||
            unitName === "Vfx Empower" ||
            unitName === "Vfx Absolving Arrow" ||
            unitName === "Vfx Borrowed Grace" ||
            unitName === "Vfx Dulling Defense" ||
            unitName === "Vfx Blind Fury" ||
            unitName === "Vfx Miner" ||
            unitName === "Vfx Madness" ||
            unitName === "Vfx Backstab" ||
            unitName === "Vfx Hamstring" ||
            unitName === "Vfx Bitter Experience" ||
            unitName === "Vfx Lucky Strike" ||
            unitName === "Vfx Shatter Armor" ||
            unitName === "Vfx Leather Armor" ||
            unitName === "Vfx Small Specie" ||
            unitName === "Vfx Shadow Touch" ||
            unitName === "Vfx Wild Regeneration" ||
            unitName === "Vfx Wind Flow" ||
            unitName === "Vfx Made Of Fire"
        ) {
            meta.loopDurationMs = meta.frameDurationsMs.reduce((sum, ms) => sum + ms, 0);
            meta.pauseMs = 0;
        } else if (unitName === "Vfx Arachna Web" && state === "aura" && Array.isArray(meta.frameDurationsMs)) {
            // The reveal precedes a separate authored loop; do not apply the generic idle pause.
            meta.loopDurationMs = meta.frameDurationsMs
                .slice(meta.loopStartFrame ?? 0)
                .reduce((sum, ms) => sum + ms, 0);
            meta.pauseMs = 0;
        } else if (unitName === "Vfx Abomination Hand" && state === "aura") {
            // The 16 authored cels are traversed forward then backward without duplicate endpoints.
            meta.loopDurationMs = meta.playbackOrder.reduce((sum, frame) => sum + meta.frameDurationsMs[frame], 0);
            meta.pauseMs = 0;
        } else if (typeof meta.totalDurationSec === "number" && Number.isFinite(meta.totalDurationSec)) {
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

    if (!copyOnly) {
        fs.writeFileSync(outputFile, lines.join("\n"), "utf8");
        console.log(`✅ Animation atlas meta generated successfully: ${outputFile}`);
    } else {
        console.log(`✅ Preserved versioned animation atlas settings: ${outputFile}`);
    }

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
            fs.copyFileSync(file, dest, fs.constants.COPYFILE_FICLONE);
            copied++;
        } catch (err) {
            console.warn(`Failed to copy atlas webp: ${file} -> ${dest}`, err);
        }
    }

    console.log(`✅ Copied ${copied} atlas .webp files into: ${imagesDir}`);
}

main();
