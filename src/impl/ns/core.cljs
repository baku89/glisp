
(defmacro defn (name params & body)
  (def attrs {})
  (if (map? params)
    (do (def attrs params)
        (def params (first body))
        (def body (rest body))))
  `(def ~name
     (with-meta
       (fn ~params
         ~(if (= 1 (count body))
            (first body)
            `(do ~@body)))
       ~attrs)))

(defmacro macroview (expr)
  `(prn (macroexpand ~expr)))

(defn load-file
  (f)
  (eval (read-string (str "(do " (slurp f) "\nnil)"))))

(defn ? (f)
  (def doc (get (meta f) :doc))
  (println
   (if doc
     (do
       (println (get doc :desc))
       (def params (get doc :params))
       (def param-width (+ 2 (reduce #(max %0 (count (first (str %1)))) 0 params)))
       (def spaces (join "" (repeat " " param-width)))
       (map #(println (slice (str (first %) spaces) 0 param-width)
                      (slice (str "[" (slice (second %) 1) "]     ") 0 10)
                      (last %))
            params)
       nil)
     "No document")))

;; Conditionals
(defmacro cond (& xs)
  (if (> (count xs) 0)
    (list
     'if
     (first xs)
     (if (> (count xs) 1) (nth xs 1) (throw "[cond] Odd number of forms to cond"))
     (cons 'cond (rest (rest xs))))))


(defmacro case (val & xs)
  (if (> (count xs) 0)
    (if (= (count xs) 1)
      (first xs)
      (list
       'if
       `(= ~val ~(first xs))
       (nth xs 1)
       (concat 'case val (rest (rest xs)))))))

(defmacro or (& xs)
  (if (empty? xs)
    false
    `(if ~(first xs) ~(first xs) (or ~@(rest xs)))))

(defmacro and (& xs)
  (if (= (count xs) 1)
    (first xs)
    `(if ~(first xs) (and ~@(rest xs)) false)))

(defn not (a) (if a false true))


;; Functioal Language Features
(defn reduce (f init xs)
  (if (empty? xs) init (reduce f (f init (first xs)) (rest xs))))

(defn foldr (f init xs)
  (if (empty? xs)
    init
    (f
     (first xs)
     (foldr f init (rest xs)))))

(defn map (f xs)
  (foldr (fn (x acc) (cons (f x) acc)) () xs))

(defn map-indexed (f xs)
  (map
   (fn (i) (f i (nth xs i)))
   (range (count xs))))

(defn filter (f xs)
  (reduce
   (fn (l x)
     (if (f x)
       (push l x)
       l))
   '()
   xs))

(defn remove (f xs)
  (reduce
   (fn (l x)
     (if (not (f x))
       (push l x)
       l))
   '()
   xs))

(defmacro ->> (values & forms)
  (reduce
   (fn (v form) `(~@form ~v))
   values
   forms))

(defn find-list (f lst)
  (do
    (if (list? lst)
      (if (f lst)
        (apply concat `(~(list lst) ~@(map #(find-list f %) lst)))
        (apply concat (map #(find-list f %) lst)))
      '())))


;; Trivial
(def g list)

(defn inc (x) (+ x 1))
(defn dec (x) (- a 1))

(defn empty? (x) (= (count x) 0))

(defn second (x) (first (rest x)))

(def gensym
  (let (counter (atom 0))
    #(symbol (str "G__" (swap! counter inc)))))
