(def defmacro
  (macro [name params & body]
         (do
  ;; Destruction of meta, param, body
         (def metadata nil)
         (if (false? (sequential? params))
           (do
             (def metadata params)
             (def params (first body))
             (def body (rest body))))
  ;; Wrap with 'do if body has multiple lines
         (if (= 1 (count body))
           (def body (first body))
           (def body `(do ~@body)))

         (if (nil? metadata)
           `(def ~name (macro ~params ~body))
           `(def ~name (with-meta (macro ~params ~body) ~metadata))))))

(defmacro defn [name params & body]
  ;; Destruction of meta, param, body
  (def metadata nil)
  (if (false? (sequential? params))
    (do
      (def metadata params)
      (def params (first body))
      (def body (rest body))))
  ;; Wrap with 'do if body has multiple lines
  (if (= 1 (count body))
    (def body (first body))
    (def body `(do ~@body)))

  (if (nil? metadata)
    `(def ~name (fn ~params ~body))
    `(def ~name (with-meta (fn ~params ~body) ~metadata))))

(def defn
  ^{:doc "Define a function"
    :params [{label: "Symbol", type: "symbol"}
             {label: "Params", type: "any"}]}
  defn)

(defmacro defalias [alias original]
  `(def ~alias (with-meta ~original
                 (hash-map
                  :alias (hash-map
                          :name ~(str original)
                          :meta (meta ~original))))))

;; Declare special forms as symbol
(def do nil)
(def & '&)

;; Annotate the parameter of special forms
(defn def
  {:doc "Create a variable"
   :params [{:label "Symbol" :type "symbol"}
            {:label "Value" :type "any"}]}
  [])

(defmacro macroview [expr]
  `(prn (macroexpand ~expr)))

(def import
  (try
    import
    (catch _
           (let (seen (atom (hash-map __filename__ nil)))
             (fn (filename)
               (if (not (contains? @seen filename))
                 (do
                   (swap! seen assoc filename nil)
                   (import-force filename))))))))

(defn ?
  {:doc "Show the help of function"
   :params [{:label "Function" :type "fn"}]
   :returns {:type "nil"}}
  [f]
  (def doc (get (meta f) :doc))
  (cond (string? doc) (println doc)
        (map? doc) (do
                     (println (get doc :desc))
                     (def params (get doc :params))
                     (def param-width
                       (+ 2 (apply max
                                   (map #(count (str (first %)))
                                        params))))
                     (def spaces (join "" (repeat " " param-width)))
                     (println
                      (join "\n"
                            (map #(join " "
                                        (list (slice (str (first %) spaces) 0 param-width)
                                              (slice (format "[%s]       " (slice (second %) 1)) 0 9)
                                              (last %)))
                                 params)))
                     nil)
        :else (println "No document")))

(defn type
  {:doc "Retruns the type of `x` in keyword"
   :params [{:label "Value" :type "any"}]
   :returns {:type "keyword"}}
  [x]
  (cond (number? x) :number
        (string? x) :string
        (boolean? x) :boolean
        (keyword? x) :keyword
        (symbol? x) :symbol
        (atom? x) :atom
        (nil? x) :nil
        (fn? x) :fn
        (macro? x) :macro))

(defn name
  {:doc "Returns the string name of string, symbol or keyword"
   :params [{:type "any"}]
   :returns {:type "string"}}
  [x]
  (cond (string? x) x
        (symbol? x) (str x) ;; Might be hacky too as below
        (keyword? x) (subs (str x) 1) ;; Might be hacky as it simply removes keyword prefix
        :else (throw "Cannot get the name")))

;; Conditionals
(defmacro when [test & body]
  (list 'if test (cons 'do body)))

(defmacro cond [& xs]
  (if (> (count xs) 0)
    (list
     'if
     (first xs)
     (if (> (count xs) 1) (nth xs 1) (throw "[cond] Odd number of forms to cond"))
     (cons 'cond (rest (rest xs))))))

(defmacro for
  {:doc "Make a iteration loop"
   :params [{:label "Binds" :type "code"}
            &
            {:label "Body" :type "code"}]}
  [binds & body]
  (let [pairs (partition 2 binds)
        syms (map first pairs)
        colls (map second pairs)
        gen-lst `(combination/product ~@colls)]
    `(map (fn [~syms] (do ~@body)) ~gen-lst)))

(defmacro case [val & xs]
  (if (> (count xs) 0)
    (if (= (count xs) 1)
      (first xs)
      (list
       'if
       `(= ~val ~(first xs))
       (nth xs 1)
       (concat 'case `(~val) (rest (rest xs)))))))

(defmacro or [& xs]
  (if (empty? xs)
    false
    `(if ~(first xs) ~(first xs) (or ~@(rest xs)))))

(defmacro and [& xs]
  (if (= (count xs) 1)
    (first xs)
    `(if ~(first xs) (and ~@(rest xs)) false)))

(defn not [a] (if a false true))


;; Functioal Language Features
(defn reduce [f init xs]
  (if (empty? xs) init (reduce f (f init (first xs)) (rest xs))))

(defn foldr [f init x]
  (if (empty? xs)
    init
    (f
     (first xs)
     (foldr f init (rest xs)))))

(defn map-indexed [f xs]
  (map
   #(f % (nth xs %))
   (range (count xs))))

(defmacro ->> [values & forms]
  (reduce
   (fn (v form) `(~@form ~v))
   values
   forms))

(defn find-list [f lst]
  (do
    (if (sequential? lst)
      (if (f lst)
        (apply concat `(~(list lst) ~@(map #(find-list f %) lst)))
        (apply concat (map #(find-list f %) lst)))
      '())))


;; Trivial
(defn identity [x] x)
(defn prn-pass [x] (do (prn x) x))

(defn zero?
  {:doc "Returns true if x is equal to 0"}
  [x]
  (= x 0))
(defn pos? [x] (> x 0))
(defn neg? [x] (< x 0))
(defn odd? [x] (= (mod x 2) 1))
(defn even? [x] (= (mod x 2) 0))

(defn  percent
  {:doc "Map the percentage value between 0-100 to normalized 0-1"
   :params [{:type "number"}]}
  [value] (/ value 100))

(defn compare
  {:doc "Returns -1 if x < y, 0 if x == y, +1 otherwise"
   :params [{:type "number"}
            {:type "number"}]}
  [x y]
  (cond (= x y) 0
        (> x y) 1
        (< x y) -1))

(defn inc [x] (+ x 1))
(defn dec [x] (- x 1))

(defn empty? [x] (= (count x) 0))

(defn second [x] (first (rest x)))

(def gensym
  (let (counter (atom 0))
    #(symbol (str "G__" (swap! counter inc)))))

(defn replace-nth [coll idx val]
  (let [ret (concat (slice coll 0 idx) [val] (slice coll (inc idx)))]
    (cond (list? coll) ret
          (vector? coll) (vec ret))))

(defn insert-nth [coll idx val]
  (let [ret (concat (slice coll 0 idx) [val] (slice coll idx))]
    (cond (list? coll) ret
          (vector? coll) (vec ret))))


;; Pretty printer a MAL object.

(def pprint
  (let (spaces- (fn (indent)
                  (if (> indent 0)
                    (str " " (spaces- (- indent 1)))
                    ""))

                pp-seq- (fn [obj indent]
                          (let (xindent (+ 1 indent))
                            (apply str (pp- (first obj) 0)
                                   (map (fn (x) (str "\n" (spaces- xindent)
                                                     (pp- x xindent)))
                                        (rest obj)))))

                pp-map- (fn [obj indent]
                          (let (ks (keys obj)
                                   kindent (+ 1 indent)
                                   kwidth (count (str (first ks)))
                                   vindent (+ 1 (+ kwidth kindent)))
                            (apply str (pp- (first ks) 0)
                                   " "
                                   (pp- (get obj (first ks)) 0)
                                   (map (fn (k) (str "\n" (spaces- kindent)
                                                     (pp- k kindent)
                                                     " "
                                                     (pp- (get obj k) vindent)))
                                        (rest (keys obj))))))

                pp- (fn (obj indent)
                      (cond
                        (list? obj)   (format "(%s)" (pp-seq- obj indent))
                        (map? obj)    (format "{%s}" (pp-map- obj indent))
                        :else         (pr-str obj))))

    (fn [obj]
      (println (pp- obj 0)))))

;; ; Load other cores
(import "ui.cljs")
(import "graphics.cljs")
(import "math.cljs")
(import "path.cljs")