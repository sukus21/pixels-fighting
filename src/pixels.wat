(module
    (import "deps" "atan2" (func $deps.atan2 (param f64) (param f64) (result f64)))
    (import "deps" "updatePixels" (func $deps.updatePixels (param i32) (param i32)))
    (import "deps" "getRngSeed" (func $deps.getRngSeed (result i32)))
    
    (memory $memory (export "memory") 0)
    (global $width (mut i32) (i32.const 0))
    (global $height (mut i32) (i32.const 0))
    (global $iterationCount (mut i64) (i64.const 0))
    (global $currentBuffer (mut i32) (i32.const 0))
    (global $bufferA (mut i32) (i32.const 0))
    (global $bufferB (mut i32) (i32.const 0))
    (global $factionCount (mut i32) (i32.const 0))
    (global $factionColors (mut i32) (i32.const 0))
    (global $ownerCounts (mut i32) (i32.const 0))
    (global $queryBuffer (mut i32) (i32.const 0))
    (global $neighborBuffer (mut i32) (i32.const 0))
    (global $currentX (mut i32) (i32.const 0))
    (global $currentY (mut i32) (i32.const 0))
    (global $rngSeed (mut i32) (i32.const 0))
    
    (func $init
        (export "init")
        (param $width i32)
        (param $height i32)
        (param $factionCount i32)
        (local $memPtr i32)

        ;; Initialize globals
        (global.set $width (local.get $width))
        (global.set $height (local.get $height))
        (global.set $factionCount (local.get $factionCount))
        (local.set $memPtr (i32.const 0))  

        ;; Allocate space for buffer A
        (global.set $bufferA (local.get $memPtr))
        (i32.shl (i32.mul (local.get $width) (local.get $height)) (i32.const 2))
        (local.set $memPtr (i32.add (local.get $memPtr)))
        
        ;; Allocate space for buffer B
        (global.set $bufferB (local.get $memPtr))
        (i32.shl (i32.mul (local.get $width) (local.get $height)) (i32.const 2))
        (local.set $memPtr (i32.add (local.get $memPtr)))
        
        ;; Allocate space for faction colors
        (global.set $factionColors (local.get $memPtr))
        (i32.shl (local.get $factionCount) (i32.const 2))
        (local.set $memPtr (i32.add (local.get $memPtr)))
        
        ;; Allocate space for owner counts
        (global.set $ownerCounts (local.get $memPtr))
        (i32.shl (local.get $factionCount) (i32.const 3))
        (local.set $memPtr (i32.add (local.get $memPtr)))
        
        ;; Allocate space for neighbor buffer
        (global.set $neighborBuffer (local.get $memPtr))
        (i32.add (local.get $memPtr) (i32.const 32))
        (local.set $memPtr)
        
        ;; Actually allocate memory
        (i32.div_u (local.get $memPtr) (i32.const 0x10000))
        (i32.add (i32.const 1))
        (drop (memory.grow))
    )

    (func $factionColor
        (export "factionColor")
        (param $faction_id i32)
        (param $color i32)

        (i32.shl (local.get $faction_id) (i32.const 2))
        (i32.add (global.get $factionColors))
        
        ;; Reverse RGBA to BGRA
        (i32.shr_u (i32.and (local.get $color) (i32.const 0xFF0000)) (i32.const 16))
        (i32.and (local.get $color) (i32.const 0xFF00))
        (i32.shl (i32.and (local.get $color) (i32.const 0xFF)) (i32.const 16))

        ;; Mix together and store
        (i32.or)
        (i32.or)
        (i32.store)
    )

    (func $reset
        (export "reset")
        (local $i i32)
        (local $j i32)
        (local $x i32)
        (local $angle f64)
        (local $offset i32)
        (local $owner i32)

        ;; Reset current buffer and iteration count
        (global.set $iterationCount (i64.const 0))
        (global.set $currentBuffer (i32.const 0))

        ;; Reset faction counts
        (global.get $factionCount)
        (i32.const 0)
        (i32.shl (global.get $factionCount) (i32.const 2))
        (memory.fill)
        
        (local.set $i (i32.const 0))
        (loop $outer_loop
            (if (i32.lt_u (local.get $i) (global.get $height)) (then
                (local.set $x (i32.mul (global.get $width) (local.get $i)))

                (local.set $j (i32.const 0))
                (loop $inner_loop
                    (if (i32.lt_u (local.get $j) (global.get $width)) (then
                        
                        ;; Get in radians
                        (f64.div (f64.convert_i32_u (global.get $width)) (f64.const 2))
                        (f64.sub (f64.convert_i32_u (local.get $i)))
                        (f64.sub (f64.const 0.5))
                        (f64.div (f64.convert_i32_u (global.get $height)) (f64.const 2))
                        (f64.sub (f64.convert_i32_u (local.get $j)))
                        (f64.sub (f64.const 0.5))
                        (call $deps.atan2)
                        
                        ;; Convert to degrees
                        (f64.mul (f64.const 57.2957795131))
                        (local.set $angle (f64.sub (f64.const 90)))

                        ;; Correct the angle
                        (loop $angleCorrection
                            (if (f64.lt (local.get $angle) (f64.const 0)) (then 
                                (f64.add (local.get $angle) (f64.const 360))
                                (local.set $angle)
                                (br $angleCorrection)
                            ))
                        )

                        ;; Convert to faction ID
                        (local.get $angle)
                        (f64.div (f64.const 360) (f64.convert_i32_u (global.get $factionCount)))
                        (f64.div)
                        (local.set $owner (i32.trunc_f64_u))

                        ;; Write to buffers
                        (local.set $offset (i32.shl (i32.add (local.get $x) (local.get $j)) (i32.const 2)))
                        (i32.add (global.get $bufferB) (local.get $offset))
                        (i32.add (global.get $bufferA) (local.get $offset))
                        (i32.store (local.get $owner))
                        (i32.store (local.get $owner))

                        ;; Increase owner count
                        (local.set $offset (i32.shl (local.get $owner) (i32.const 3)))
                        (local.set $offset (i32.add (global.get $ownerCounts) (local.get $offset)))
                        (local.get $offset)
                        (i64.load (local.get $offset))
                        (i64.store (i64.add (i64.const 1)))

                        ;; j++
                        (local.set $j (i32.add (local.get $j) (i32.const 1)))
                        (br $inner_loop)
                    ))
                )

                ;; i++
                (local.set $i (i32.add (local.get $i) (i32.const 1)))
                (br $outer_loop)
            ))
        )

        ;; Now redraw
        (call $draw)
    )

    (func $step
        (export "step")
        (local $newBuffer i32)
        (local $oldBuffer i32)
        (local $i i32)
        (local $j i32)
        (local $neighborBufferStart i32)
        (local $ptr i32)

        (global.set $rngSeed (call $deps.getRngSeed))
        (global.set $iterationCount (i64.add (global.get $iterationCount) (i64.const 1)))

        ;; Swap buffers
        (i32.sub (i32.const 1) (global.get $currentBuffer))
        (local.tee $oldBuffer)
        (global.set $currentBuffer)

        (select (global.get $bufferB) (global.get $bufferA) (local.get $oldBuffer))
        (local.tee $oldBuffer)
        (global.set $queryBuffer)
        
        (select (global.get $bufferA) (global.get $bufferB) (local.get $oldBuffer))
        (local.set $newBuffer)

        (local.set $neighborBufferStart (global.get $neighborBuffer))
        (local.set $i (i32.const 0))

        (loop $L0
            (if (i32.lt_u (local.get $i) (global.get $width)) (then
                (local.set $j (i32.const 0))
                (global.set $currentX (local.get $i))

                (loop $L2
                    (if (i32.lt_u (local.get $j) (global.get $height)) (then
                        (global.set $currentY (local.get $j))

                        ;; Go through all neighbors
                        (call $getNeighbor (i32.const -1) (i32.const 0))
                        (call $getNeighbor (i32.const 1) (i32.const 0))
                        (call $getNeighbor (i32.const 0) (i32.const 1))
                        (call $getNeighbor (i32.const -1) (i32.const 1))
                        (call $getNeighbor (i32.const 1) (i32.const 1))
                        (call $getNeighbor (i32.const 0) (i32.const -1))
                        (call $getNeighbor (i32.const -1) (i32.const -1))
                        (call $getNeighbor (i32.const 1) (i32.const -1))
                        
                        ;; Convert coordinates to pointer
                        (i32.mul (local.get $j) (global.get $width))
                        (i32.add (local.get $i))
                        (i32.shl (i32.const 2))
                        
                        ;; Pointers to new and old buffers
                        (local.tee $ptr)
                        (i32.add (local.get $newBuffer))
                        (i32.add (local.get $ptr) (local.get $oldBuffer))
                        
                        ;; Get pointer to owner buffer
                        (i32.load)
                        (i32.shl (i32.const 3))
                        (i32.add (global.get $ownerCounts))

                        ;; Decrement old owner
                        (local.tee $ptr)
                        (i64.sub (i64.load (local.get $ptr)) (i64.const 1))
                        (i64.store)

                        ;; Select random neighbor index
                        (call $rng (local.get $i) (local.get $j))
                        (i32.sub (global.get $neighborBuffer) (local.get $neighborBufferStart))
                        (i32.rem_u)
                        (i32.and (i32.const 0xFC))

                        ;; Reset neighbor buffer pointer
                        (global.set $neighborBuffer (local.get $neighborBufferStart))

                        ;; Get previously selected random neighbor
                        (i32.add (global.get $neighborBuffer))
                        (i32.load)
                        (local.tee $ptr)
                        (i32.store)
                        
                        ;; Increment new owner
                        (i32.shl (local.get $ptr) (i32.const 3))
                        (i32.add (global.get $ownerCounts))
                        (local.tee $ptr)
                        (i64.add (i64.load (local.get $ptr)) (i64.const 1))
                        (i64.store)

                        ;; j++
                        (local.set $j (i32.add (local.get $j) (i32.const 1)))
                        (br $L2)
                    ))
                )
                
                ;; i++
                (local.set $i (i32.add (local.get $i) (i32.const 1)))
                (br $L0)
            ))
        )

        ;; Redraw
        (call $draw)
    )

    (func $getNeighbor
        (param $offsetX i32)
        (param $offsetY i32)
        (local $neighbor i32)

        ;; Get X position
        (i32.add (local.get $offsetX) (global.get $currentX))
        (local.tee $offsetX)
        (if (i32.ge_u (global.get $width)) (then
            (return (i32.const -1))
        ))

        ;; Get Y position
        (i32.add (local.get $offsetY) (global.get $currentY))
        (local.tee $offsetY)
        (if (i32.ge_u (global.get $height)) (then
            (return (i32.const -1))
        ))

        ;; Get pixel offset
        (i32.mul (local.get $offsetY) (global.get $width))
        (i32.add (local.get $offsetX))
        (i32.shl (i32.const 2))
        (i32.add (global.get $queryBuffer))
        (i32.load)

        ;; Does neighbor exist? (bit 32 set)
        (local.tee $neighbor)
        (if (i32.eq (i32.const -1)) (then
            (return)
        ))

        ;; Store in- and advance neighbor buffer
        (i32.store (global.get $neighborBuffer) (local.get $neighbor))
        (global.set $neighborBuffer (i32.add (global.get $neighborBuffer) (i32.const 4)))
    )

    (func $rng
        (param $x i32)
        (param $y i32)
        (result i32)
        (local $temp i32)

        ;; Get a good mix in here
        (i32.add (local.get $x) (global.get $rngSeed))
        (i32.mul (local.get $y) (global.get $width))
        (i32.add)

        ;; Do a bunch of bit-fiddling
        (i32.xor (i32.const 0xA3C59AC3))
        (i32.mul (i32.const 0x9E3779B9))
        (local.tee $temp)
        (i32.shr_u (i32.const 16))
        (i32.xor (local.get $temp))
        (i32.mul (i32.const 0x9E3779B9))
        (local.tee $temp)
        (i32.shr_u (i32.const 16))
        (i32.xor (local.get $temp))
        (i32.mul (i32.const 0x9E3779B9))
    )

    (func $draw
        (export "draw")
        (local $dataBuffer i32)
        (local $paintBuffer i32)
        (local $i i32)
        (local $bufferBounds i32)
        
        (select (global.get $bufferA) (global.get $bufferB) (global.get $currentBuffer))
        (local.set $dataBuffer)
        (select (global.get $bufferB) (global.get $bufferA) (global.get $currentBuffer))
        (local.set $paintBuffer)

        (local.set $bufferBounds (i32.mul (global.get $width) (global.get $height)))
        (local.set $i (i32.const 0))
        (loop $L0
            (if (i32.lt_u (local.get $i) (local.get $bufferBounds)) (then
                ;; Get paint and data pointers
                (i32.add (local.get $paintBuffer) (i32.shl (local.get $i) (i32.const 2)))
                (i32.add (local.get $dataBuffer) (i32.shl (local.get $i) (i32.const 2)))

                ;; Get color of owner
                (i32.shl (i32.load) (i32.const 2))
                (i32.add (global.get $factionColors))
                (i32.load)

                ;; Full alpha, always
                (i32.store (i32.or (i32.const 0xFF000000)))

                ;; i++
                (local.set $i (i32.add (local.get $i) (i32.const 1)))
                (br $L0)
            ))
        )

        (local.get $paintBuffer)
        (i32.add (local.get $paintBuffer) (i32.shl (local.get $bufferBounds) (i32.const 2)))
        (call $deps.updatePixels)
    )

    (func $getIterations
        (export "getIterations")
        (result i64)

        (global.get $iterationCount)
    )

    (func $getFactionCount
        (export "getFactionCount")
        (param $p0 i32)
        (result i64)

        (i32.shl (local.get $p0) (i32.const 3))
        (i32.add (global.get $ownerCounts))
        (i64.load)
    )
)
