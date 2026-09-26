class _Unavailable:
    def __init__(self, *a, **k):
        raise RuntimeError('本 App 未内置 curl_cffi，请使用 requests postman')


class AsyncSession(_Unavailable):
    pass


class Session(_Unavailable):
    pass


def get(*a, **k):
    raise RuntimeError('本 App 未内置 curl_cffi')


def post(*a, **k):
    raise RuntimeError('本 App 未内置 curl_cffi')
