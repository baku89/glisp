(import-js-force "../js/lib_core.js")

;; Declare special forms as symbol
(def & '&)

;; Annotate JS Functions
(def +
  ^{:doc "Returns the sum of nums"
    :params [& {:label "x" :type "number" :default 0}]
    :returns {:type "number"}}
  +)

(def -
  ^{:doc "If no ys are supplied, returns the negation of x, else subtracts the ys from x"
    :params [{:label "x" :type "number"}
             &
             {:label "y" :type "number"}]
    :returns {:type "number"}}
  -)

(def *
  ^{:doc "Returns the product of nums"
    :params [& {:label "x" :type "number" :default 1}]
    :returns {:type "number"}}
  *)

(def /
  ^{:doc "If no ys are supplied, returns 1/x, else returns numerator divided by all of the ys"
    :params [{:label "x" :type "number"}
             &
             {:label "y" :type "number" :default 1}]
    :retruns {:type "number"}}
  /)

(def mod
  ^{:doc "Modulus of num and div. Truncates toward negative infinity"
    :params [{:label "x" :type "number"}
             {:label "y" :type "number"}]
    :returns {:type "number"}}
  mod)

(def range
  ^{:doc "Returns a vector of nums from *start* to *end* (exclusive), by *step*"
    :params [[{:label "End" :type "number"}]
             [{:label "Start" :type "number"}
              {:label "End" :type "number"}]
             [{:label "Start" :type "number"}
              {:label "End" :type "number"}
              {:label "Step" :type "number"}]]
    :returns {:type "vector"}}
  range)

(def rnd
  ^{:doc "Returns a random number between 0-1. Unlike *random*, always returns same value for same *seed*"
    :params [:label "Seed" :type "number"]
    :returns {:type "number"}}
  rnd)

;; Defn

(def defmacro
  ^{:doc "Define a macro"
    :params [{label: "Symbol", type: "symbol"}
             {label: "Params", type: "any"}]}
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

(defmacro defn
  {:doc "Define a function"
    :params [{label: "Symbol", type: "symbol"}
             {label: "Params", type: "any"}]}
  [name params & body]
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

(defmacro def- [& xs]
  `(do (def ~@xs) nil))

(defmacro defalias [alias original]
  `(def ~alias (with-meta ~original
                 (hash-map
                  :alias (hash-map
                          :name ~(str original)
                          :meta (meta ~original))))))

(defn fn-meta [f]
  (def fm (meta f))
  (def alias (get fm :alias))
  (if alias
    (get alias :meta)
    fm))

;; Annotate the parameter of special forms
(def def
  ^{:doc "Create a variable"
   :params [{:label "Symbol" :type "symbol"}
            {:label "Value" :type "any"}]}
  (fn []))

(def let
  ^{:doc "Creates a lexical scope"
   :parmas [{:label "Binds" :type "code"}
            &
            {:label "Expr" :type "code"}]}
  (fn []))

(def do
  ^{:doc "Evaluates *exprs* in order and returns the value of the last"
   :params [&
            {:label "Expr" :type "code"}]}
  (fn []))

(def if
  ^{:doc "Evaluates *test*. If truthy, evaluates and yields *then*, otherwise, evaluates and yields *else*. If *else* is not supplied it defaults to nil"
  :params [{:label "Test" :type "code"}
           {:label "Then" :type "code"}
           {:label "Else" :type "code" :default nil}]}
  (fn []))

(defn quote
  ^{:doc "Yields the unevaluated *form*"
   :params [{:label "Form" :type "code"}]}
  (fn []))

(def fn
  ^{:doc "Defines a function"
   :params [{:label "Params" :type "code"}
            {:label "Expr" :type "code"}]}
  (fn []))

(defn macro
  ^{:doc "Defines a macro"
   :params [{:label "Params" :type "code"}
            {:label "Expr" :type "code"}]}
  (fn []))

(defmacro macroview [exp]
  `(prn (macroexpand ~exp)))

(def import
  (try
    import
    (catch _
           (let [seen (atom (hash-map __filename__ nil))]
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
  (cond (list? x) :list
        (vector? x) :vector
        (map? x) :map
        (buffer? x) :buffer
        (number? x) :number
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
(defmacro when
  {:doc "Evaluates test. If true, evaluates body in an implicit do"
   :params [{:type "code"}
            &
            {:type "code"}]}
  [test & body]
  (list 'if test (cons 'do body)))

(defmacro cond [& xs]
  (if (> (count xs) 0)
    (list
     'if
     (first xs)
     (if (> (count xs) 1) (nth xs 1) (throw "[cond] Odd number of forms to cond"))
     (cons 'cond (rest (rest xs))))))


(def for
  ^{:doc "Make a iteration loop"
    :params [{:label "Binds" :type "code"}
             &
             {:label "Body" :type "code"}]}
  (let
   [destruct-binds
    (fn [binds]
      (do
        (def pairs (partition 2 binds))
        (def entries (filter #(symbol? (first %)) pairs))
        (def options (->> pairs
                          (filter #(keyword? (first %)))
                          (apply concat)
                          (apply hash-map)))
        [entries options]))]

    (macro [binds & body]
           (let [[entries options] (destruct-binds binds)
                 syms (map first entries)
                 colls (map second entries)
                 gen-lst `(combination/product ~@colls)]
             (if (contains? options :index)
               `(map-indexed (fn [~(get options :index) ~syms]
                               (do ~@body)) ~gen-lst)
               `(map (fn [~syms] (do ~@body)) ~gen-lst))))))

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
  (let [counter (atom 0)]
    #(symbol (str "G__" (swap! counter inc)))))

(defn replace-nth [coll idx val]
  (let [ret (concat (slice coll 0 idx) [val] (slice coll (inc idx)))]
    (cond (list? coll) ret
          (vector? coll) (vec ret))))

(defn insert-nth [coll idx val]
  (let [ret (concat (slice coll 0 idx) [val] (slice coll idx))]
    (cond (list? coll) ret
          (vector? coll) (vec ret))))

;; Load other cores
(import "ui.cljs")
(import "graphics.cljs")
(import "math.cljs")
(import "path.cljs")