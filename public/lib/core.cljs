(import-js-force "../js/lib_core.js")

;; Declare special forms as symbol
(def & '&)

;; Annotate Repl Core Functions
(def prn
  ^{:doc "Prints the objects to the console"
    :params [& {:label "x" :type "any"}]}
  prn)

(def println
  ^{:doc "Prints the string with newline"
    :params [& {:label "Text" :type "any"}]}
  println)

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
  (fn [] nil))

(def let
  ^{:doc "Creates a lexical scope"
   :parmas [{:label "Binds" :type "code"}
            &
            {:label "Expr" :type "code"}]}
  (fn [] nil))

(def do
  ^{:doc "Evaluates *exprs* in order and returns the value of the last"
   :params [&
            {:label "Expr" :type "code"}]}
  (fn [] nil))

(def if
  ^{:doc "Evaluates *test*. If truthy, evaluates and yields *then*, otherwise, evaluates and yields *else*. If *else* is not supplied it defaults to nil"
  :params [{:label "Test" :type "code"}
           {:label "Then" :type "code"}
           {:label "Else" :type "code" :default nil}]}
  (fn [] nil))

(def quote
  ^{:doc "Yields the unevaluated *form*"
   :params [{:label "Form" :type "code"}]}
  (fn [] nil))

(def fn
  ^{:doc "Defines a function"
   :params [{:label "Params" :type "code"}
            {:label "Expr" :type "code"}]}
  (fn [] nil))

(def macro
  ^{:doc "Defines a macro"
   :params [{:label "Params" :type "code"}
            {:label "Expr" :type "code"}]}
  (fn [] nil))

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
                                        (list (take param-width (str (first %) spaces))
                                              (take 9
                                                    (format "[%s]       "
                                                             (drop 1 (second %))))
                                              (last %)))
                                 params)))
                     nil)
        :else (println "No document")))

(def type
  ^{:doc "Retruns the type of `x` in keyword"
   :params [{:label "Value" :type "any"}]
   :returns {:type "keyword"}}
  type)

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
      (let
        [pairs (partition 2 binds)
         entries (filter #(symbol? (first %)) pairs)
         options (->> pairs
                      (filter #(keyword? (first %)))
                      (apply concat)
                      (apply hash-map))]
        [entries options]))]

    (macro [binds & body]
           (let [[entries options] (destruct-binds binds)
                 syms (map first entries)
                 colls (map second entries)
                 gen-lst `(combination/product ~@colls)
                 index-sym (get options :index)]
             (if index-sym
               `(map-indexed (fn [~index-sym ~syms]
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

(defmacro ->> [expr & forms]
  (reduce
   (fn [v form] `(~@form ~v))
   expr
   forms))

(defmacro -> [expr & forms]
  (reduce
   (fn [v form] `(~(first form) ~v ~@(rest form)))
   expr
   forms))

(defmacro as-> [expr name & forms]
  (reduce
   (fn [prev-form form] `(let [~name ~prev-form] ~form))
     expr
     forms))

(defn mapcat [& xs]
  (apply concat (apply map xs)))


(defn match-elements [pred lst]
  (if (sequential? lst)
    (if (and (element? lst) (pred lst))
      ;; Match
      [lst]
      
      ;; Not match but sequence
      (remove nil? (mapcat #(match-elements pred %) lst)))))


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

;;  List 
(defn replace-nth [coll idx val]
  (let [ret (concat (take idx coll) [val] (drop (inc idx) coll))]
    (cond (list? coll) ret
          (vector? coll) (vec ret))))

(defn insert-nth [coll idx val]
  (let [ret (concat (take idx coll) [val] (drop idx coll))]
    (cond (list? coll) ret
          (vector? coll) (vec ret))))

(defn take
  {:doc "Retruns a sequence of the first n items in coll"}
  [n coll]
  (slice coll 0 n))

(defn drop
  {:doc "Returns a sequence of all but the first n items in coll"}
  [n coll]
  (slice coll n))

(defn take-last
  {:doc "Returns a seq of the last n items in coll"}
  [n coll]
  (slice coll (- (count coll) n)))

(defn drop-last
  {:doc "Returns a sequence of all but the last n items in coll"}
  [n coll]
  (take (- (count coll) n) coll))

;; String
(defn ends-with?
  {:doc "True if *s* ends with substr"
   :params [{:type "string"}
            {:type "string"}]}
  [s substr]
  (= (subs s (- (count s) (count substr))) substr))

(defn starts-with?
  {:doc "True if *s* ends with substr"
   :params [{:type "string"}
            {:type "string"}]}
  [s substr]
  (= (subs s 0 (count substr)) substr))

;; Load other cores
(import "ui.cljs")
(import "graphics.cljs")
(import "math.cljs")
(import "path.cljs")