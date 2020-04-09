(def! $tools ())

(defmacro! deftool! (fn (name params body)
	`(do
		(def! ~name (fn ~params ~body))
		(def! $tools (push $tools '~name)))))

(deftool! pencil (state input) (do

	(if (nil? (first state))
			(def! state '((quote path) false false false)))

	(let
		(
			; State
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
			needs-update (or just-down (and p (or (!= x px) (!= y py))))
		)
		
		(list
			; return false if no needs to update
			needs-update
				
			; Return Updated Item
			(if needs-update
				`(quote
					~(concat
						item
						`(~(if just-down 'M 'L)	~x ~y)
					)
				)
				`(quote ~item)
			)
			; Updated State
			x y p
		)
	)
))

(deftool! draw-circle (state input) (do

	(if (nil? (first state))
			(def! state '((merge-path) 0 0 false)))

	(let
		(
			; State
			item  (first state)
			pp		(nth state 3)
			
			; Input
			x		(nth input 0)
			y		(nth input 1)
			p		(nth input 2)
			
			; just mouse down?
			just-down (and (not pp) p)
			needs-update p
			
			cx		(if just-down x (nth state 1))
			cy		(if just-down y (nth state 2))
			
			c `(circle ~cx ~cy ~(round (distance cx cy x y)))
		)
		
		`(
			; return false if no needs to update
			~p
				
			; Return Updated Item
			~(if p
				(if just-down
					(concat item (list c))
					(concat (non-last item) (list c))
				)
				item
			)
			
			; Updated State
			~cx ~cy ~p
		)
	)
))


(deftool! draw-rect (state input) (do

	(if (nil? (first state))
			(def! state '((merge-path) 0 0 false)))

	(let
		(
			; State
			item  (first state)
			pp		(nth state 3)
			
			; Input
			x		(nth input 0)
			y		(nth input 1)
			p		(nth input 2)
			
			; just mouse down?
			just-down (and (not pp) p)
			needs-update p
			
			ox		(if just-down x (nth state 1))
			oy		(if just-down y (nth state 2))
			
			c `(rect ~ox ~oy ~(- x ox) ~(- y oy))
		)
		
		`(
			; return false if no needs to update
			~p
				
			; Return Updated Item
			~(if p
				(if just-down
					(concat item (list c))
					(concat (non-last item) (list c))
				)
				item
			)
			
			; Updated State
			~ox ~oy ~p
		)
	)
))