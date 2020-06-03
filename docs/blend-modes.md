# ブレンドモードの分類

ブレンドモードは、名前からどういう働きをするかが分かりづらいものが多いので、自分なりに整理しておきます。

$a$が背景レイヤー、 $b$が上に重ねるレイヤー。反転値を、それぞれ$\overline{a} = 1 - a, \overline{b} = 1 - b$とします。

### 二者択一

| 名前             | 計算式 |
| ---------------- | ------ |
| Normal           | $b$    |
| Destination Over | $a$    |

### 加算

| 名前               | 計算式                        |
| ------------------ | ----------------------------- |
| Linear Dodge (Add) | $a + b$                       |
| Linear Burn        | $\overline{a} + \overline{b}$ |
| AddSub             |                               |

Linear Burn は分かりづらいですが、「[暗さを足す](http://fe0km.blog.fc2.com/blog-entry-77.html)」イメージです。
AddSub は Substance Designer にあるブレンドモード。

### 乗算

| 名前       | 計算式                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Multiply   | $ab$                                                                                                              |
| Screen     | $\overline{\overline{a}\ \overline{b}}$                                                                           |
| Overlay    | $\begin{cases} 2ab, & \text{if}\ a>0.5 \\ \overline{2\overline{a}\ \overline{b}}, & \text{otherwise} \end{cases}$ |
| Hard Light | $\begin{cases} 2ab, & \text{if}\ b>0.5 \\ \overline{2\overline{a}\ \overline{b}}, & \text{otherwise} \end{cases}$ |

下 2 つは、$a$、$b$いずれかが 50%グレーより明るければ Screen、暗ければ Multiply と場合分けします。明るい色はより明るく、暗い色はより暗くなるということです。Overlay の場合は$a$を基準に、Hard Light は$b$を場合分けの基準にするだけ。つまり、$Overlay(b, a) = HardLight(a, b)$ の関係です。

### 最大・最小

| 名前      | 計算式      |
| --------- | ----------- |
| Lighten   | $max(a, b)$ |
| Darken    | $min(a, b)$ |
| Pin Light |             |

### 除算

| Mode        | Calculation                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------- |
| Color Dodge | $\begin{cases} 1, & \text{if}\ b=1\\ a / \overline{b}, & \text{otherwise} \end{cases}$            |
| Color Burn  | $\begin{cases} 0, & \text{if}\ b=0\\ \overline{\overline{a} / b}, & \text{otherwise} \end{cases}$ |
| Vivid Light |                                                                                                   |

Dodge と Burn の場合分けは単にゼロ除算対策のため。やっていることは至ってシンプルです。

Vivid Light は b を基準とした

### 差分

| 名前       | 計算式                              |
| ---------- | ----------------------------------- |
| Subtract   | $a - b$                             |
| Difference | $\|a - b\|$                         |
| Exclusion  | $\overline{a}\ b + a\ \overline{b}$ |

Subtract だと負の値を取ることもありますが、絶対値をとって必ず 0-1 になるようにしたのが Difference。

Exclusion は、ニュアンスとしては 50%グレーを基準にした Difference。a, b が同じとき、Difference の場合は 0（黒）になるが、Exclusion は 0.5（50%グレー）になる。

### Soft Light

上のレイヤーの値に基づき僅かに明るくなったり暗くなったりします。

| 名前       | 計算式                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Soft Light | $ \begin{cases} 2ab + a^2(1 - 2b), & \text{if}\ b < 0.5\\ 2a\overline{b} + a^{0.5}(2b - 1), & \text{otherwise} \end{cases}$ |
