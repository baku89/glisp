(import "math.cljs")

(defpen pencil (state input)
  (do

  ; Initialize state
    (if (nil? (first state))
      (def state '((quote :path) false false false)))

    (let
     (; State
      item  (last (first state))
      px		(nth state 1)
      py		(nth state 2)
      pp		(nth state 3)

      ; Input
      x		(nth input 0)
      y		(nth input 1)
      p		(nth input 2)

      ; just mouse down?
      just-down (and (not pp) p)
      needs-update (or just-down (and p (or (not= x px) (not= y py)))))

      (list
      ; Updated Item or nil if no needs to update
       (if needs-update
         `(quote
           ~(concat
             item
             `(~(if just-down :M :L)	~x ~y))))
      ; Updated State
       x y p))))

(defpen draw-circle (state input)
  (do

  ; Initialize state
    (if (nil? (first state))
      (def state '((g) 0 0 false)))

    (let
     (; State
      item  (first state)
      pp		(nth state 3)

      ; Input
      x		(nth input 0)
      y		(nth input 1)
      p		(nth input 2)

      ; just mouse down?
      just-down (and (not pp) p)

      cx		(if just-down x (nth state 1))
      cy		(if just-down y (nth state 2)))

      (list
      ; Updated Item or nil if no needs to update
       (if p
         (let (C `(circle ~cx ~cy ~(round (distance cx cy x y))))
           (if just-down
             (concat item (list C))
             (concat (butlast item) (list C)))))

      ; Updated State
       cx cy p))))


(defpen draw-rect (state input)
  (do

  ; Initialize state
    (if (nil? (first state))
      (def state '((g) 0 0 false)))

    (let
     (; State
      item  (first state)
      pp		(nth state 3)

      ; Input
      x		(nth input 0)
      y		(nth input 1)
      p		(nth input 2)

      ; just mouse down?
      just-down (and (not pp) p)

      ox		(if just-down x (nth state 1))
      oy		(if just-down y (nth state 2)))

      (list
      ; Updated Item or nil if no needs to update
       (if p
         (let (R `(rect ~ox ~oy ~(- x ox) ~(- y oy)))
           (if just-down
             (concat item (list R))
             (concat (butlast item) (list R)))))

      ; Updated State
       ox oy p))))

(defpen draw-poly (state input) 
  do

  (if (nil? (first state))
    (def state '((poly) false false false)))

  (let
   (; State
    item	(nth state 0)
    px		(nth state 1)
    py		(nth state 2)
    pp		(nth state 3)

    ; Input
    x		(nth input 0)
    y		(nth input 1)
    p		(nth input 2)

    just-down (and (not pp) p)
    needs-update (or just-down (and p (or (not= x px) (not= y py)))))

    (list
      ; Updated Item or nil if no needs to update
     (if needs-update
       (if just-down
         (push item x y)
         (push (slice item 0 (- (count item) 2)) x y))
       nil)

      ; Updated state
     x y p))))