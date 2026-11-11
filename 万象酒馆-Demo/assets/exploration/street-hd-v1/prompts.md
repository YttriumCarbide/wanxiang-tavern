## street_hd_left_prompt

```text
Use case: stylized-concept / precise environment repaint.
Asset type: the LEFT ONE-THIRD high-resolution square tile of a single continuous fantasy RPG street background. The input image is the full existing 3:1 panoramic street, used as the strict composition and architecture reference.
Generate ONLY the LEFT THIRD of that input, equivalent to x=0% through x=36% of the full panorama, from ground to sky. Output a SQUARE image, highest available native resolution, ideally 2048x2048. This is NOT a new view or a newly invented street. Keep one camera at human eye height, the exact same vanishing point and level horizon as the reference, same afternoon warm side-light and coherent physical scale.
Composition in this tile: large tavern timber door with a simple eight-point gold star at left; warm ivory plaster and a few exposed timber beams; a shuttered window toward the middle; a modest stone arch and the distant continuation of the SAME narrow street toward the right. The near street occupies bottom 28%, clearly walkable and empty. Door and window shapes must be straight, legible and plausible.
VISUAL STYLE: attractive clean hand-painted Japanese fantasy adventure / visual-novel environment. Controlled broad flat planes, elegant well-defined silhouettes, soft cel-shaded value transitions, smooth clean plaster, clearly readable architectural forms. Warm cream, faded terracotta, restrained teal shutters, calm foliage green. High quality drawing, NOT realistic photography, NOT pixel art, NOT voxel graphics.
CLEAN-UP IS CRITICAL: remove about 70 percent of leaves, flowers, ivy, tiny bottles, chipped stones and scattered speckles from the reference. Ivy appears only in two or three grouped silhouettes. Road uses larger orderly stone slabs with restrained joints, not thousands of pebbles or mottled light flecks. No grain, no film noise, no dither, no rough paper texture, no oversharpening, no busy stippled brushwork, no glittering foliage, no exaggerated HDR.
Right boundary must remain a simple continuation of the arch/pale wall/road, suitable for matching a center tile. Do not add a second city in the sky, fantasy portals, stairs breaking the ground, different distant streets or a decorative frame. No people, no text, no labels, no UI, no border, no watermark. Entire output is artwork, not a triptych or three panels.
```

## street_hd_clean_left_prompt

```text
Repaint this exact square environment tile in a MUCH CLEANER, CALMER visual-novel background style. Preserve the exact camera, the outlines and positions of the tavern door, star emblem, shuttered window, arch, ground and roof. This is the approved geometry, not approved texture.
MANDATORY SIMPLIFICATION: Completely REMOVE every vine growing on the door frame and window wall. Remove ALL foliage covering the leftmost edge. Replace the large bush at bottom left with one small plain terracotta pot with a simple rounded leafy silhouette. Remove the bushes covering the arch. Keep at most two low plain pots near the far wall. Walls must be large smooth warm ivory plaster shapes without stains, chipping, speckles or random flecks. The wooden door is one calm dark wood plane with only a handful of board seams and no woodgrain scratches. Sky is a smooth blue-to-peach gradient with just two or three broad soft clouds, NOT many little cloud fragments.
Ground: large broad stone paving slabs, restrained joint lines, no cracks and gravel, no high-frequency grain, no grass between every stone, no dotted sun-flecks; only a few broad soft shadow shapes. Simplify plants to grouped painted masses rather than hundreds of individual bright leaf tips.
Art direction: polished Japanese fantasy adventure background, clean anime linework, broad controlled cel-painted forms, delicate coherent architecture, atmospheric warm light. Richly designed shapes but quiet surfaces. NOT vector clipart, NOT a realistic texture photo, NOT rough watercolor, NOT gritty, NOT pixel art. Keep sufficient elegance and depth, no blur. It should feel like a well-drawn anime background with room to breathe. Clean does not mean blank or unfinished.
HIGHEST available native resolution, SQUARE tile. No people, lettering, labels, UI, border or vignette. Do not make a triptych.
```

## street_hd_center_prompt

```text
Create the NEXT SQUARE TILE extending the clean first reference image to the RIGHT, as one continuous fantasy town street painting.
REFERENCE 1 is the approved clean LEFT TILE: use its exact architecture scale, camera, material simplicity, lighting and colors.
REFERENCE 2 is the older complete panoramic street: use only the rough ordering of landmarks, NOT its noisy foliage or surface texture.
Output ONE square high-resolution CENTER TILE. It covers the region beginning at x=80% of Reference 1 and extending one full tile-width to the right. Its LEFT 20% repeats the RIGHT 20% of Reference 1 pixel-faithfully as an overlap: same stone arch edge, identical roof edge heights, same pale wall and same foreground slabs. Do NOT move the camera or stand in a new spot, do NOT create a new vanishing point, do NOT invent a second arch. Keep all seam-crossing ground edges at the exact same heights. Horizon and road vanishing height remain about 62% of image height, matching reference 1.
Beyond the shared arch on the left, reveal the apothecary on the right side of the SAME street: ivory plaster, elegant faded teal canopy, one simple broad shuttered display window holding ONLY 8 to 10 clearly grouped medicine jars, a small hanging sign with a plain herb symbol but NO LETTERS. One sturdy wood door toward the right edge. The scene opens onto a calm, spacious small paving apron across the foreground; frontmost 30% remains clear for character sprites. Roof silhouettes continue naturally, no elevated city behind or above the street.
CALM CLEAN ART: match reference 1's polished anime fantasy visual-novel background. Smooth cream plaster with large quiet surface areas; warm terracotta roof; broad matte clean stone slabs; 2 or 3 small plant masses only. Crisp well-controlled form edges with soft coherent warm shadows. No crawling ivy carpets. No tiny glints, film grain, dither, bark grain, chips, stains, mossy cracks, clusters of flowers, cluttered props, high-frequency speckle, oversharpening or HDR. Sky mostly clear soft blue with a few broad peach clouds.
No people, UI, text, border, labels or watermark. Full square image contains only the next section of the environment, NOT two panels, a collage, or the old full panorama squeezed into a square.
```

## street_hd_right_prompt

```text
Create the RIGHT END SQUARE TILE of the same continuous clean fantasy town street background.
Reference 1 is the CENTER TILE, immediately to the left. Reference 2 is the LEFT TILE, for the single camera, coherent ground and lighting. Output only the NEXT tile on their right; do NOT repeat the full street.
This new tile begins at x=80% of reference 1 and extends one tile-width to the right. LEFT 20% of the output must reproduce the RIGHT 20% of reference 1 as an overlap with identical scale and vertical placement: the same pharmacy doorway edge, pale wall, small doorstep and terracotta pot, not an extra door. Keep the paving lines and step edges entering the new frame at the same y coordinates. Eye height, perspective and warm late-afternoon light are unchanged.
The new visible area contains a small recessed courtyard beside the pharmacy: a modest freestanding wood notice board with 3 blank pale papers, a simple low pale stone wall fountain with a dark metal spout and shallow rectangular basin, and a quiet narrow lane turning out of sight on the far right. Above them a few teal shutters and a small unbroken area of warm pale plaster; a few grouped tree shapes behind roofs, no dense vines. Courtyard ground and street foreground must connect into one flat continuous walkable surface. Leave the lowest 30 percent uncluttered, with generous broad paving slabs where character sprites can stand. No raised terraces under characters, no city in the sky, no distant panorama pasted into a doorway.
STRICT CLEAN STYLE: exactly match references' polished clean Japanese fantasy anime adventure background. Smooth large plaster shapes, quiet surfaces, subtle clean wood, coherent terracotta roof shapes. Sparse grouped plants, only a few pots. Broad soft shadows, no hundreds of spotted sunlight marks. Crisp readable drawing, no blur, no grain, no gritty texture, no film noise, no dither, no mossy cracks, no excessive weathering, no leaf confetti, no harsh HDR. Attractive and finished, not blank or flat vector clipart.
Square high-resolution native PNG, no people, no readable text, no UI, no frames, no watermark. The image is one continuous extension, not a collage or triptych.
```

