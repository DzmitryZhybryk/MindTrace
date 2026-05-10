from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class EmailMessage:
    """
    Готовое к отправке письмо: транспорт-агностичная единица передачи.

    Содержит уже отрендеренные HTML и текст — рендеринг шаблонов остаётся
    на стороне домена-отправителя. From-адрес определяется конфигурацией
    транспорта.
    """

    to: str
    subject: str
    html: str
    text: str
