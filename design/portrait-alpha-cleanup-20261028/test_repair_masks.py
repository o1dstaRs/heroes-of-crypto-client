import unittest
import numpy as np
from repair_masks import reconstruct_matte

class MaskReconstructionTests(unittest.TestCase):
    def test_troll_club_air_pocket_clears_but_dark_weapon_survives(self):
        a = np.zeros((808, 572, 4), np.uint8)
        a[250:280, 435:470] = [0, 0, 0, 255]
        a[245:250, 430:480] = [95, 75, 55, 255]
        a[330:370, 460:510] = [0, 0, 0, 255]
        b, report = reconstruct_matte(a, "troll")
        self.assertGreater(report['removedCavityPixels'], 900)
        self.assertEqual(b[265, 450, 3], 0)
        np.testing.assert_array_equal(b[245:250, 430:480], a[245:250, 430:480])
        self.assertEqual(b[350, 480, 3], 255)

    def test_troll_keyed_hair_edge_preserves_dark_inner_strands(self):
        a = np.zeros((808, 572, 4), np.uint8)
        a[100:200, 100:200] = [65, 52, 40, 255]
        a[100:102, 110:180] = [0, 0, 0, 255]
        a[120:180, 120:180, :3] = 0
        raw = a[:, :, :3].copy()
        raw[100:103, 110:180] = [10, 85, 15]
        b, _ = reconstruct_matte(a, "troll", raw)
        self.assertEqual(b[100, 140, 3], 0)
        np.testing.assert_array_equal(b[135:165, 135:165], a[135:165, 135:165])

    def test_troll_edge_smoothing_never_reveals_hidden_transparent_rgb(self):
        a = np.full((808, 572, 4), [255, 0, 255, 0], np.uint8)
        a[100:200, 100:200] = [90, 65, 40, 255]
        b, _ = reconstruct_matte(a, "troll")
        self.assertFalse(np.any(b[:, :, 3][a[:, :, 3] == 0]))

    def test_troll_detached_rectangular_key_remnant_is_removed(self):
        a = np.zeros((808, 572, 4), np.uint8)
        a[110:250, 200:360] = [65, 50, 35, 255]
        a[94:103, 312:316] = [18, 18, 18, 255]
        b, _ = reconstruct_matte(a, "troll")
        self.assertEqual(int(b[94:103, 312:316, 3].sum()), 0)
        np.testing.assert_array_equal(b[130:230, 230:330], a[130:230, 230:330])

    def test_reviewed_bow_cavity_clears_without_erasing_bow_string(self):
        a = np.zeros((808, 572, 4), np.uint8)
        a[280:410, 140:250] = [0, 0, 0, 255]
        a[280:410, 138:140] = [145, 120, 65, 255]
        b, report = reconstruct_matte(a, "dryad")
        self.assertGreater(report['removedCavityPixels'], 1000)
        self.assertEqual(b[340, 200, 3], 0)
        np.testing.assert_array_equal(b[300:390, 138:140], a[300:390, 138:140])

    def test_black_armour_and_eyes_are_not_a_global_colour_key(self):
        a = np.full((100, 100, 4), [110, 75, 40, 255], np.uint8)
        a[25:75, 25:75, :3] = 0
        b, _ = reconstruct_matte(a, "goblin_knight")
        np.testing.assert_array_equal(b[30:70, 30:70], a[30:70, 30:70])

    def test_solid_tissue_recovers_opacity_using_its_own_rgb(self):
        a = np.zeros((60, 60, 4), np.uint8)
        a[5:55, 5:55] = [100, 80, 60, 255]
        a[20:40, 20:40, 3] = 120
        b, _ = reconstruct_matte(a, "healer", a[:, :, :3])
        self.assertEqual(b[30, 30, 3], 255)
        np.testing.assert_array_equal(a[30, 30, :3], b[30, 30, :3])

    def test_large_anatomical_opening_stays_open(self):
        a = np.full((100, 100, 4), [120, 90, 60, 255], np.uint8)
        a[30:70, 30:70] = 0
        b, _ = reconstruct_matte(a, "arachna_spider", np.full((100, 100, 3), 100, np.uint8))
        self.assertEqual(b[50, 50, 3], 0)

    def test_tiny_puncture_recovers_same_pose_not_hidden_webp_rgb(self):
        a = np.full((100, 100, 4), [120, 90, 60, 255], np.uint8)
        a[40:43, 40:43] = [255, 0, 255, 0]
        raw = np.full((100, 100, 3), [90, 70, 50], np.uint8)
        b, _ = reconstruct_matte(a, "healer", raw)
        np.testing.assert_array_equal(b[41, 41], [90, 70, 50, 255])

    def test_magic_and_smoke_keep_fractional_alpha(self):
        for slug in ["fairy", "monk", "nightmare", "tsar_cannon"]:
            a = np.full((60, 60, 4), [80, 45, 110, 100], np.uint8)
            b, _ = reconstruct_matte(a, slug, a[:, :, :3])
            np.testing.assert_array_equal(b, a)

    def test_coloured_particles_and_connected_hairs_survive(self):
        a = np.zeros((100, 100, 4), np.uint8)
        a[30:90, 30:80] = [90, 65, 40, 255]
        a[10:12, 10:12] = [255, 200, 80, 255]
        a[25:31, 40] = [30, 20, 10, 255]
        b, _ = reconstruct_matte(a, "fairy")
        self.assertEqual(b[10, 10, 3], 255)
        self.assertEqual(b[26, 40, 3], 255)

    def test_fully_transparent_rgb_is_sanitized(self):
        a = np.full((50, 50, 4), [245, 12, 180, 0], np.uint8)
        b, _ = reconstruct_matte(a, "healer")
        self.assertEqual(int(b.sum()), 0)

if __name__ == '__main__': unittest.main()
