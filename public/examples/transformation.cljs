;; Example: Transformation

(background "#08101D")

[:g {;; Applies transformation to the draw context.
     ;; You can see the stroke scales
     :transform
     (mat2d/* (translate [200 100])
              (scale [2 1])
              (pivot [50 50]
                     (rotate (deg 45))))}

 [:g {:style (stroke "#FFE04E" 10)}

	 ;; Applies transformation to the path data.
  (path/transform
   (mat2d/* (rotate 0)
            (scale [1 2]))
   (rect [0 0] [100 100]))]]

