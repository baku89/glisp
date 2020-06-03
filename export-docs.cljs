;; Template would be like below:

;; ###path/rect

;;    Generates a rect path

;; - **Alias:** `rect `- **Parameters:**

;; | Name | Type   | Description                                    |
;; | ---- | ------ | :--------------------------------------------- |
;; | Pos  | `vec2 `| coordinate of top-left corner of the rectangle |
;; | Size | `vec2 `| size of the rectangle                          |

(defn gen-param-column [idx param variadic]
  (if (= param &)
    nil
    (format "| %-8s | %-9s | %-12s |\n"
            (format "%s%s"
                    (if variadic "& " "")
                    (get param :label (format "%%%d" idx)))
            (str "`" (get param :type "") "`")
            (get param :desc ""))))

(defn gen-param-table [params]
  (if (not (sequential? params))
    nil
    (if (sequential? (first params))
      ;; Multi arity function
      (apply str
             (map #(->> %
                        (gen-param-table)
                        (format "%s\n"))
                  params))

      ;; Generate Table
      (str
       "| Name     | Type      | Description  |\n"
       "| -------- | --------- | :----------- |\n"
       (apply
        str
        (remove nil?
                (map-indexed
                 (fn [i p]
                   (gen-param-column
                    i p (and (> i 0)
                             (= & (nth params (dec i))))))
                 params)))
       "\n"))))

(defn gen-doc [sym m f]
  (apply
   str

   (remove
    nil?

    [(format "### %s\n\n" (name sym))

     (prn (name sym) (fn-params f))

     (if (contains? m :doc)
       (format "%s\n\n" (get m :doc)))

     (if (contains? m :alias)
       (format "Alias for `%s`\n\n" (get (get m :alias) :name)))

     (if (contains? m :params)
       (format "**Parameter**\n\n"))
     (gen-param-table (get m :params))

     (if (contains? m :returns)
       (format "**returns** `%s`\n\n" (get (get m :returns) :type)))])))


(def md (->> (get-all-symbols)
             (map #(vector % (meta (eval %)) (eval %)))
             (remove #(nil? (second %)))
             (map #(apply gen-doc %))))

(def txt (join "\n" md))

(spit "docs/ref.md" txt)