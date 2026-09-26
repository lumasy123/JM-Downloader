"""curl_cffi 桩模块。

安卓上没有 curl_cffi 的原生轮子，但 jmcomic 的 __init__ 顶层会导入它
（只为了异步客户端）。本 App 走同步路径 + requests，所以这里只需要让
import 成功；真被调用时再报错，方便暴露问题而不是静默走错路。
"""
from . import requests  # noqa: F401
