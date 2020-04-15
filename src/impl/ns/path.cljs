;; Path modifiers
(defn path/map-points (f path)
  (cons
   :path
   (apply concat
          (map
           (fn (xs)
             (let (cmd (first xs) points (rest xs))
               `(~cmd ~@(apply concat
                               (map f (partition 2 points))))))
           (path/split-segments path)))))

(defn path/translate (x y path)
  (let
   (f (fn (pos)
        `(~(+ (first pos) x) ~(+ (last pos) y))))
    (path/map-points f path)))

(defn path/scale (x y path)
  (let
   (f (fn (pos)
        `(~(* (first pos) x) ~(* (last pos) y))))
    (path/map-points f path)))

(defn path/rotate (x y angle path)
  (let (origin (list x y))
    (path/map-points #(vec2/rotate origin angle %) path)))

(defn path/merge (& xs)
  `(path ~@(apply concat (map rest xs))))
