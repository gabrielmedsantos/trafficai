// Run inside backend with node stdin. Dry-run unless --apply is explicitly supplied.
const connection = require('./dist/database/connection');
const pack = {
  "version": 1,
  "templates": [
    {
      "key": "email_recovery_0",
      "name": "PADRÃO • Recuperação E0 — Falta só um passo, {{name}}",
      "channel": "email",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "Falta só um passo, {{name}}",
      "preheader": "Retome sua compra ou fale com a equipe para tirar dúvidas.",
      "body": "Olá, {{name}}!\n\nSua compra de {{product}} ainda não foi concluída. Retome pelo link e confira as condições de pagamento disponíveis.\n\n{{checkout_url}}\n\nSe encontrou alguma dificuldade, responda este e-mail. Podemos ajudar.\n\nNão quer receber novas ofertas? {{unsubscribe_url}}",
      "blocks": [
        {
          "type": "heading",
          "text": "Falta só um passo, {{name}}"
        },
        {
          "type": "text",
          "text": "Olá, {{name}}!"
        },
        {
          "type": "text",
          "text": "Sua compra de {{product}} ainda não foi concluída. Retome pelo link e confira as condições de pagamento disponíveis."
        },
        {
          "type": "text",
          "text": "Se encontrou alguma dificuldade, responda este e-mail. Podemos ajudar."
        },
        {
          "type": "text",
          "text": "Não quer receber novas ofertas? {{unsubscribe_url}}"
        },
        {
          "type": "button",
          "text": "CONFERIR MINHA OFERTA",
          "url": "{{checkout_url}}"
        }
      ],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "email_recovery_1",
      "name": "PADRÃO • Recuperação E1 — Ficou alguma dúvida sobre {{product}}?",
      "channel": "email",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "Ficou alguma dúvida sobre {{product}}?",
      "preheader": "Retome sua compra ou fale com a equipe para tirar dúvidas.",
      "body": "Olá, {{name}}!\n\nVocê chegou perto de concluir sua compra de {{product}}. O que faltou para decidir?\n\nSe foi uma dúvida sobre o conteúdo ou o pagamento, responda por aqui. Para continuar seu pedido:\n{{checkout_url}}\n\nNão quer receber novas ofertas? {{unsubscribe_url}}",
      "blocks": [
        {
          "type": "heading",
          "text": "Ficou alguma dúvida sobre {{product}}?"
        },
        {
          "type": "text",
          "text": "Olá, {{name}}!"
        },
        {
          "type": "text",
          "text": "Você chegou perto de concluir sua compra de {{product}}. O que faltou para decidir?"
        },
        {
          "type": "text",
          "text": "Não quer receber novas ofertas? {{unsubscribe_url}}"
        },
        {
          "type": "button",
          "text": "CONFERIR MINHA OFERTA",
          "url": "{{checkout_url}}"
        }
      ],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "email_recovery_2",
      "name": "PADRÃO • Recuperação E2 — Veja se {{product}} é o próximo passo para você",
      "channel": "email",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "Veja se {{product}} é o próximo passo para você",
      "preheader": "Retome sua compra ou fale com a equipe para tirar dúvidas.",
      "body": "Olá, {{name}}!\n\nAntes de decidir, confira o que está incluído em {{product}} e como o conteúdo se encaixa no que você procura.\n\nEscolha com clareza. Os detalhes e as condições da oferta estão aqui:\n{{checkout_url}}\n\nNão quer receber novas ofertas? {{unsubscribe_url}}",
      "blocks": [
        {
          "type": "heading",
          "text": "Veja se {{product}} é o próximo passo para você"
        },
        {
          "type": "text",
          "text": "Olá, {{name}}!"
        },
        {
          "type": "text",
          "text": "Antes de decidir, confira o que está incluído em {{product}} e como o conteúdo se encaixa no que você procura."
        },
        {
          "type": "text",
          "text": "Não quer receber novas ofertas? {{unsubscribe_url}}"
        },
        {
          "type": "button",
          "text": "CONFERIR MINHA OFERTA",
          "url": "{{checkout_url}}"
        }
      ],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "email_recovery_3",
      "name": "PADRÃO • Recuperação E3 — {{name}}, vamos tirar sua ideia do papel?",
      "channel": "email",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "{{name}}, vamos tirar sua ideia do papel?",
      "preheader": "Retome sua compra ou fale com a equipe para tirar dúvidas.",
      "body": "Olá, {{name}}!\n\nSe {{product}} combina com seu objetivo, o próximo passo é simples: confira a oferta e conclua seu pedido.\n\n{{checkout_url}}\n\nPrefere esclarecer uma dúvida primeiro? Responda este e-mail.\n\nNão quer receber novas ofertas? {{unsubscribe_url}}",
      "blocks": [
        {
          "type": "heading",
          "text": "{{name}}, vamos tirar sua ideia do papel?"
        },
        {
          "type": "text",
          "text": "Olá, {{name}}!"
        },
        {
          "type": "text",
          "text": "Se {{product}} combina com seu objetivo, o próximo passo é simples: confira a oferta e conclua seu pedido."
        },
        {
          "type": "text",
          "text": "Prefere esclarecer uma dúvida primeiro? Responda este e-mail."
        },
        {
          "type": "text",
          "text": "Não quer receber novas ofertas? {{unsubscribe_url}}"
        },
        {
          "type": "button",
          "text": "CONFERIR MINHA OFERTA",
          "url": "{{checkout_url}}"
        }
      ],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "email_recovery_4",
      "name": "PADRÃO • Recuperação E4 — Ainda pensando em {{product}}?",
      "channel": "email",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "Ainda pensando em {{product}}?",
      "preheader": "Retome sua compra ou fale com a equipe para tirar dúvidas.",
      "body": "Olá, {{name}}!\n\nAinda não identificamos a conclusão da sua compra. Se você quer continuar, confira os detalhes pelo link abaixo.\n\n{{checkout_url}}\n\nNossa equipe pode ajudar com dúvidas sobre acesso, conteúdo e pagamento.\n\nNão quer receber novas ofertas? {{unsubscribe_url}}",
      "blocks": [
        {
          "type": "heading",
          "text": "Ainda pensando em {{product}}?"
        },
        {
          "type": "text",
          "text": "Olá, {{name}}!"
        },
        {
          "type": "text",
          "text": "Ainda não identificamos a conclusão da sua compra. Se você quer continuar, confira os detalhes pelo link abaixo."
        },
        {
          "type": "text",
          "text": "Nossa equipe pode ajudar com dúvidas sobre acesso, conteúdo e pagamento."
        },
        {
          "type": "text",
          "text": "Não quer receber novas ofertas? {{unsubscribe_url}}"
        },
        {
          "type": "button",
          "text": "CONFERIR MINHA OFERTA",
          "url": "{{checkout_url}}"
        }
      ],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "email_recovery_5",
      "name": "PADRÃO • Recuperação E5 — O que falta para você decidir, {{name}}?",
      "channel": "email",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "O que falta para você decidir, {{name}}?",
      "preheader": "Retome sua compra ou fale com a equipe para tirar dúvidas.",
      "body": "Olá, {{name}}!\n\nNão precisa decidir com dúvida. Conte para a equipe o que você quer saber sobre {{product}}.\n\nSe já estiver tudo certo, retome sua compra:\n{{checkout_url}}\n\nNão quer receber novas ofertas? {{unsubscribe_url}}",
      "blocks": [
        {
          "type": "heading",
          "text": "O que falta para você decidir, {{name}}?"
        },
        {
          "type": "text",
          "text": "Olá, {{name}}!"
        },
        {
          "type": "text",
          "text": "Não precisa decidir com dúvida. Conte para a equipe o que você quer saber sobre {{product}}."
        },
        {
          "type": "text",
          "text": "Não quer receber novas ofertas? {{unsubscribe_url}}"
        },
        {
          "type": "button",
          "text": "CONFERIR MINHA OFERTA",
          "url": "{{checkout_url}}"
        }
      ],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "email_recovery_6",
      "name": "PADRÃO • Recuperação E6 — Último lembrete desta sequência sobre {{product}}",
      "channel": "email",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "Último lembrete desta sequência sobre {{product}}",
      "preheader": "Retome sua compra ou fale com a equipe para tirar dúvidas.",
      "body": "Olá, {{name}}!\n\nEste é o último lembrete desta sequência sobre sua compra de {{product}}. Se ainda fizer sentido para você, confira as condições disponíveis:\n\n{{checkout_url}}\n\nSe este não for o momento, tudo bem. Obrigado pelo seu interesse!\n\nNão quer receber novas ofertas? {{unsubscribe_url}}",
      "blocks": [
        {
          "type": "heading",
          "text": "Último lembrete desta sequência sobre {{product}}"
        },
        {
          "type": "text",
          "text": "Olá, {{name}}!"
        },
        {
          "type": "text",
          "text": "Este é o último lembrete desta sequência sobre sua compra de {{product}}. Se ainda fizer sentido para você, confira as condições disponíveis:"
        },
        {
          "type": "text",
          "text": "Se este não for o momento, tudo bem. Obrigado pelo seu interesse!"
        },
        {
          "type": "text",
          "text": "Não quer receber novas ofertas? {{unsubscribe_url}}"
        },
        {
          "type": "button",
          "text": "CONFERIR MINHA OFERTA",
          "url": "{{checkout_url}}"
        }
      ],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "wa_recovery_0",
      "name": "PADRÃO • Recuperação W0 — Lembrete",
      "channel": "whatsapp",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "",
      "preheader": "",
      "body": "Oi, {{name}}! 👋 Você começou a compra de {{product}}, mas ela ainda não foi concluída. Ficou alguma dúvida? Para retomar:\n{{checkout_url}}\n\nSe não quiser receber novas ofertas, responda SAIR ou acesse {{unsubscribe_url}}",
      "blocks": [],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "wa_recovery_1",
      "name": "PADRÃO • Recuperação W1 — Ajuda no pagamento",
      "channel": "whatsapp",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "",
      "preheader": "",
      "body": "{{name}}, posso ajudar com sua compra de {{product}}? Confira o pedido e as formas de pagamento disponíveis pelo checkout:\n{{checkout_url}}\n\nSe não quiser receber novas ofertas, responda SAIR ou acesse {{unsubscribe_url}}",
      "blocks": [],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "wa_recovery_2",
      "name": "PADRÃO • Recuperação W2 — Conteúdo e decisão",
      "channel": "whatsapp",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "",
      "preheader": "",
      "body": "Quer continuar com {{product}}? Confira o conteúdo e as condições antes de decidir. Se precisar de ajuda, responda por aqui.\n{{checkout_url}}\n\nSe não quiser receber novas ofertas, responda SAIR ou acesse {{unsubscribe_url}}",
      "blocks": [],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "wa_recovery_3",
      "name": "PADRÃO • Recuperação W3 — Tirar dúvidas",
      "channel": "whatsapp",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "",
      "preheader": "",
      "body": "Oi, {{name}}! O que falta para você decidir sobre {{product}}? Nossa equipe pode esclarecer dúvidas sobre o produto e o pagamento.\n{{checkout_url}}\n\nSe não quiser receber novas ofertas, responda SAIR ou acesse {{unsubscribe_url}}",
      "blocks": [],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "wa_recovery_4",
      "name": "PADRÃO • Recuperação W4 — Retomar compra",
      "channel": "whatsapp",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "",
      "preheader": "",
      "body": "{{name}}, ainda quer concluir sua compra de {{product}}? Se fizer sentido para você, retome pelo link:\n{{checkout_url}}\n\nSe não quiser receber novas ofertas, responda SAIR ou acesse {{unsubscribe_url}}",
      "blocks": [],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "wa_recovery_5",
      "name": "PADRÃO • Recuperação W5 — Encerramento",
      "channel": "whatsapp",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "",
      "preheader": "",
      "body": "Último lembrete desta sequência, {{name}}! Se quiser continuar com {{product}}, confira as condições disponíveis:\n{{checkout_url}}\n\nSe este não for o momento, tudo bem. 🙂\n\nSe não quiser receber novas ofertas, responda SAIR ou acesse {{unsubscribe_url}}",
      "blocks": [],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "email_upsell_0",
      "name": "PADRÃO • Upsell E0 — Oferta complementar",
      "channel": "email",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "Oferta complementar",
      "preheader": "Retome sua compra ou fale com a equipe para tirar dúvidas.",
      "body": "Olá, {{name}}! Sua compra anterior foi aprovada. Obrigado pela confiança!\n\nTemos uma oferta adicional para você conhecer: {{product}}. Ela é opcional e não altera o acesso ao que você já comprou.\n\nConfira o conteúdo, o valor e as condições:\n{{checkout_url}}\n\nNão quer receber novas ofertas? {{unsubscribe_url}}",
      "blocks": [
        {
          "type": "heading",
          "text": "Oferta complementar"
        },
        {
          "type": "text",
          "text": "Olá, {{name}}! Sua compra anterior foi aprovada. Obrigado pela confiança!"
        },
        {
          "type": "text",
          "text": "Temos uma oferta adicional para você conhecer: {{product}}. Ela é opcional e não altera o acesso ao que você já comprou."
        },
        {
          "type": "text",
          "text": "Não quer receber novas ofertas? {{unsubscribe_url}}"
        },
        {
          "type": "button",
          "text": "CONFERIR MINHA OFERTA",
          "url": "{{checkout_url}}"
        }
      ],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "email_upsell_1",
      "name": "PADRÃO • Upsell E1 — Esclarecer dúvidas",
      "channel": "email",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "Esclarecer dúvidas",
      "preheader": "Retome sua compra ou fale com a equipe para tirar dúvidas.",
      "body": "Oi, {{name}}! Você conseguiu conferir {{product}}?\n\nSe essa oferta complementar combina com o que você procura, veja os detalhes e decida com clareza. Se tiver dúvida, fale com a equipe.\n{{checkout_url}}\n\nNão quer receber novas ofertas? {{unsubscribe_url}}",
      "blocks": [
        {
          "type": "heading",
          "text": "Esclarecer dúvidas"
        },
        {
          "type": "text",
          "text": "Oi, {{name}}! Você conseguiu conferir {{product}}?"
        },
        {
          "type": "text",
          "text": "Não quer receber novas ofertas? {{unsubscribe_url}}"
        },
        {
          "type": "button",
          "text": "CONFERIR MINHA OFERTA",
          "url": "{{checkout_url}}"
        }
      ],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "email_upsell_2",
      "name": "PADRÃO • Upsell E2 — Último acompanhamento",
      "channel": "email",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "Último acompanhamento",
      "preheader": "Retome sua compra ou fale com a equipe para tirar dúvidas.",
      "body": "{{name}}, este é o último lembrete desta sequência sobre {{product}}.\n\nSe quiser complementar sua compra, confira a oferta:\n{{checkout_url}}\n\nSua compra anterior continua válida independentemente desta decisão.\n\nNão quer receber novas ofertas? {{unsubscribe_url}}",
      "blocks": [
        {
          "type": "heading",
          "text": "Último acompanhamento"
        },
        {
          "type": "text",
          "text": "{{name}}, este é o último lembrete desta sequência sobre {{product}}."
        },
        {
          "type": "text",
          "text": "Sua compra anterior continua válida independentemente desta decisão."
        },
        {
          "type": "text",
          "text": "Não quer receber novas ofertas? {{unsubscribe_url}}"
        },
        {
          "type": "button",
          "text": "CONFERIR MINHA OFERTA",
          "url": "{{checkout_url}}"
        }
      ],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "whatsapp_upsell_0",
      "name": "PADRÃO • Upsell W0 — Oferta complementar",
      "channel": "whatsapp",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "",
      "preheader": "",
      "body": "Olá, {{name}}! Sua compra anterior foi aprovada. Obrigado pela confiança!\n\nTemos uma oferta adicional para você conhecer: {{product}}. Ela é opcional e não altera o acesso ao que você já comprou.\n\nConfira o conteúdo, o valor e as condições:\n{{checkout_url}}\n\nSe não quiser receber novas ofertas, responda SAIR ou acesse {{unsubscribe_url}}",
      "blocks": [],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "whatsapp_upsell_1",
      "name": "PADRÃO • Upsell W1 — Esclarecer dúvidas",
      "channel": "whatsapp",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "",
      "preheader": "",
      "body": "Oi, {{name}}! Você conseguiu conferir {{product}}?\n\nSe essa oferta complementar combina com o que você procura, veja os detalhes e decida com clareza. Se tiver dúvida, fale com a equipe.\n{{checkout_url}}\n\nSe não quiser receber novas ofertas, responda SAIR ou acesse {{unsubscribe_url}}",
      "blocks": [],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    },
    {
      "key": "whatsapp_upsell_2",
      "name": "PADRÃO • Upsell W2 — Último acompanhamento",
      "channel": "whatsapp",
      "purpose": "marketing",
      "language": "pt_BR",
      "subject": "",
      "preheader": "",
      "body": "{{name}}, este é o último lembrete desta sequência sobre {{product}}.\n\nSe quiser complementar sua compra, confira a oferta:\n{{checkout_url}}\n\nSua compra anterior continua válida independentemente desta decisão.\n\nSe não quiser receber novas ofertas, responda SAIR ou acesse {{unsubscribe_url}}",
      "blocks": [],
      "parameters": [
        "name",
        "product",
        "checkout_url",
        "unsubscribe_url"
      ]
    }
  ],
  "flows": [
    {
      "name": "MODELO • Compra aprovada — sincronizar tags",
      "source_id": null,
      "product_id": null,
      "recovery": false,
      "settings": {
        "sales_mode": "purchase_tags",
        "max_messages": 1,
        "days": [
          1,
          2,
          3,
          4,
          5,
          6
        ],
        "allowed_start": 8,
        "allowed_end": 20,
        "time_zone": "America/Fortaleza",
        "folder": "templates"
      },
      "graph": {
        "schemaVersion": 1,
        "nodes": [
          {
            "id": "start",
            "type": "trigger",
            "position": {
              "x": 0,
              "y": 0
            },
            "data": {
              "label": "Início",
              "config": {
                "event": "payment.approved"
              }
            }
          },
          {
            "id": "paid",
            "type": "tag",
            "position": {
              "x": 280,
              "y": 0
            },
            "data": {
              "label": "Marcar compra do produto",
              "config": {
                "operation": "add",
                "tag": "{{product_tag}}"
              }
            }
          },
          {
            "id": "clear",
            "type": "tag",
            "position": {
              "x": 560,
              "y": 0
            },
            "data": {
              "label": "Retirar recuperação",
              "config": {
                "operation": "remove",
                "tag": "recuperando:{{product_tag}}"
              }
            }
          },
          {
            "id": "end",
            "type": "end",
            "position": {
              "x": 840,
              "y": 0
            },
            "data": {
              "label": "Fim",
              "config": {}
            }
          }
        ],
        "edges": [
          {
            "id": "e0",
            "source": "start",
            "target": "paid"
          },
          {
            "id": "e1",
            "source": "paid",
            "target": "clear"
          },
          {
            "id": "e2",
            "source": "clear",
            "target": "end"
          }
        ]
      }
    },
    {
      "name": "MODELO • Recuperação — E-mail 7 contatos",
      "source_id": null,
      "product_id": null,
      "recovery": true,
      "settings": {
        "sales_mode": "recovery",
        "max_messages": 7,
        "days": [
          1,
          2,
          3,
          4,
          5,
          6
        ],
        "allowed_start": 8,
        "allowed_end": 20,
        "time_zone": "America/Fortaleza",
        "folder": "templates"
      },
      "graph": {
        "schemaVersion": 1,
        "nodes": [
          {
            "id": "start",
            "type": "trigger",
            "position": {
              "x": 0,
              "y": 0
            },
            "data": {
              "label": "Início",
              "config": {
                "event": "checkout.started"
              }
            }
          },
          {
            "id": "tag",
            "type": "tag",
            "position": {
              "x": 280,
              "y": 0
            },
            "data": {
              "label": "Em recuperação",
              "config": {
                "operation": "add",
                "tag": "recuperando:{{product_tag}}"
              }
            }
          },
          {
            "id": "wait0",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 0
            },
            "data": {
              "label": "Esperar até 10 min",
              "config": {
                "seconds": 600
              }
            }
          },
          {
            "id": "guard0",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 0
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought0",
            "type": "end",
            "position": {
              "x": 0,
              "y": 160
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message0",
            "type": "message",
            "position": {
              "x": 280,
              "y": 160
            },
            "data": {
              "label": "Mensagem 1",
              "config": {
                "channel": "email",
                "templateId": "email_recovery_0",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait1",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 160
            },
            "data": {
              "label": "Esperar até 60 min",
              "config": {
                "seconds": 3000
              }
            }
          },
          {
            "id": "guard1",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 160
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought1",
            "type": "end",
            "position": {
              "x": 0,
              "y": 320
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message1",
            "type": "message",
            "position": {
              "x": 280,
              "y": 320
            },
            "data": {
              "label": "Mensagem 2",
              "config": {
                "channel": "email",
                "templateId": "email_recovery_1",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait2",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 320
            },
            "data": {
              "label": "Esperar até 240 min",
              "config": {
                "seconds": 10800
              }
            }
          },
          {
            "id": "guard2",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 320
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought2",
            "type": "end",
            "position": {
              "x": 0,
              "y": 480
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message2",
            "type": "message",
            "position": {
              "x": 280,
              "y": 480
            },
            "data": {
              "label": "Mensagem 3",
              "config": {
                "channel": "email",
                "templateId": "email_recovery_2",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait3",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 480
            },
            "data": {
              "label": "Esperar até 720 min",
              "config": {
                "seconds": 28800
              }
            }
          },
          {
            "id": "guard3",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 480
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought3",
            "type": "end",
            "position": {
              "x": 0,
              "y": 640
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message3",
            "type": "message",
            "position": {
              "x": 280,
              "y": 640
            },
            "data": {
              "label": "Mensagem 4",
              "config": {
                "channel": "email",
                "templateId": "email_recovery_3",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait4",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 640
            },
            "data": {
              "label": "Esperar até 1440 min",
              "config": {
                "seconds": 43200
              }
            }
          },
          {
            "id": "guard4",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 640
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought4",
            "type": "end",
            "position": {
              "x": 0,
              "y": 800
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message4",
            "type": "message",
            "position": {
              "x": 280,
              "y": 800
            },
            "data": {
              "label": "Mensagem 5",
              "config": {
                "channel": "email",
                "templateId": "email_recovery_4",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait5",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 800
            },
            "data": {
              "label": "Esperar até 2880 min",
              "config": {
                "seconds": 86400
              }
            }
          },
          {
            "id": "guard5",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 800
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought5",
            "type": "end",
            "position": {
              "x": 0,
              "y": 960
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message5",
            "type": "message",
            "position": {
              "x": 280,
              "y": 960
            },
            "data": {
              "label": "Mensagem 6",
              "config": {
                "channel": "email",
                "templateId": "email_recovery_5",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait6",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 960
            },
            "data": {
              "label": "Esperar até 4320 min",
              "config": {
                "seconds": 86400
              }
            }
          },
          {
            "id": "guard6",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 960
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought6",
            "type": "end",
            "position": {
              "x": 0,
              "y": 1120
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message6",
            "type": "message",
            "position": {
              "x": 280,
              "y": 1120
            },
            "data": {
              "label": "Mensagem 7",
              "config": {
                "channel": "email",
                "templateId": "email_recovery_6",
                "integrationId": null
              }
            }
          },
          {
            "id": "clear",
            "type": "tag",
            "position": {
              "x": 560,
              "y": 1120
            },
            "data": {
              "label": "Finalizar recuperação",
              "config": {
                "operation": "remove",
                "tag": "recuperando:{{product_tag}}"
              }
            }
          },
          {
            "id": "end",
            "type": "end",
            "position": {
              "x": 840,
              "y": 1120
            },
            "data": {
              "label": "Fim",
              "config": {}
            }
          }
        ],
        "edges": [
          {
            "id": "e0",
            "source": "start",
            "target": "tag"
          },
          {
            "id": "e1",
            "source": "tag",
            "target": "wait0"
          },
          {
            "id": "e2",
            "source": "wait0",
            "target": "guard0"
          },
          {
            "id": "e3",
            "source": "guard0",
            "target": "bought0",
            "sourceHandle": "yes"
          },
          {
            "id": "e4",
            "source": "guard0",
            "target": "message0",
            "sourceHandle": "no"
          },
          {
            "id": "e5",
            "source": "message0",
            "target": "wait1"
          },
          {
            "id": "e6",
            "source": "wait1",
            "target": "guard1"
          },
          {
            "id": "e7",
            "source": "guard1",
            "target": "bought1",
            "sourceHandle": "yes"
          },
          {
            "id": "e8",
            "source": "guard1",
            "target": "message1",
            "sourceHandle": "no"
          },
          {
            "id": "e9",
            "source": "message1",
            "target": "wait2"
          },
          {
            "id": "e10",
            "source": "wait2",
            "target": "guard2"
          },
          {
            "id": "e11",
            "source": "guard2",
            "target": "bought2",
            "sourceHandle": "yes"
          },
          {
            "id": "e12",
            "source": "guard2",
            "target": "message2",
            "sourceHandle": "no"
          },
          {
            "id": "e13",
            "source": "message2",
            "target": "wait3"
          },
          {
            "id": "e14",
            "source": "wait3",
            "target": "guard3"
          },
          {
            "id": "e15",
            "source": "guard3",
            "target": "bought3",
            "sourceHandle": "yes"
          },
          {
            "id": "e16",
            "source": "guard3",
            "target": "message3",
            "sourceHandle": "no"
          },
          {
            "id": "e17",
            "source": "message3",
            "target": "wait4"
          },
          {
            "id": "e18",
            "source": "wait4",
            "target": "guard4"
          },
          {
            "id": "e19",
            "source": "guard4",
            "target": "bought4",
            "sourceHandle": "yes"
          },
          {
            "id": "e20",
            "source": "guard4",
            "target": "message4",
            "sourceHandle": "no"
          },
          {
            "id": "e21",
            "source": "message4",
            "target": "wait5"
          },
          {
            "id": "e22",
            "source": "wait5",
            "target": "guard5"
          },
          {
            "id": "e23",
            "source": "guard5",
            "target": "bought5",
            "sourceHandle": "yes"
          },
          {
            "id": "e24",
            "source": "guard5",
            "target": "message5",
            "sourceHandle": "no"
          },
          {
            "id": "e25",
            "source": "message5",
            "target": "wait6"
          },
          {
            "id": "e26",
            "source": "wait6",
            "target": "guard6"
          },
          {
            "id": "e27",
            "source": "guard6",
            "target": "bought6",
            "sourceHandle": "yes"
          },
          {
            "id": "e28",
            "source": "guard6",
            "target": "message6",
            "sourceHandle": "no"
          },
          {
            "id": "e29",
            "source": "message6",
            "target": "clear"
          },
          {
            "id": "e30",
            "source": "clear",
            "target": "end"
          }
        ]
      }
    },
    {
      "name": "MODELO • Recuperação — WhatsApp Pix / checkout 6 contatos",
      "source_id": null,
      "product_id": null,
      "recovery": true,
      "settings": {
        "sales_mode": "recovery",
        "max_messages": 6,
        "days": [
          1,
          2,
          3,
          4,
          5,
          6
        ],
        "allowed_start": 8,
        "allowed_end": 20,
        "time_zone": "America/Fortaleza",
        "folder": "templates"
      },
      "graph": {
        "schemaVersion": 1,
        "nodes": [
          {
            "id": "start",
            "type": "trigger",
            "position": {
              "x": 0,
              "y": 0
            },
            "data": {
              "label": "Início",
              "config": {
                "event": "checkout.started"
              }
            }
          },
          {
            "id": "tag",
            "type": "tag",
            "position": {
              "x": 280,
              "y": 0
            },
            "data": {
              "label": "Em recuperação",
              "config": {
                "operation": "add",
                "tag": "recuperando:{{product_tag}}"
              }
            }
          },
          {
            "id": "wait0",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 0
            },
            "data": {
              "label": "Esperar até 10 min",
              "config": {
                "seconds": 600
              }
            }
          },
          {
            "id": "guard0",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 0
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought0",
            "type": "end",
            "position": {
              "x": 0,
              "y": 160
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message0",
            "type": "message",
            "position": {
              "x": 280,
              "y": 160
            },
            "data": {
              "label": "Mensagem 1",
              "config": {
                "channel": "whatsapp",
                "templateId": "wa_recovery_0",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait1",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 160
            },
            "data": {
              "label": "Esperar até 20 min",
              "config": {
                "seconds": 600
              }
            }
          },
          {
            "id": "guard1",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 160
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought1",
            "type": "end",
            "position": {
              "x": 0,
              "y": 320
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message1",
            "type": "message",
            "position": {
              "x": 280,
              "y": 320
            },
            "data": {
              "label": "Mensagem 2",
              "config": {
                "channel": "whatsapp",
                "templateId": "wa_recovery_1",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait2",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 320
            },
            "data": {
              "label": "Esperar até 140 min",
              "config": {
                "seconds": 7200
              }
            }
          },
          {
            "id": "guard2",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 320
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought2",
            "type": "end",
            "position": {
              "x": 0,
              "y": 480
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message2",
            "type": "message",
            "position": {
              "x": 280,
              "y": 480
            },
            "data": {
              "label": "Mensagem 3",
              "config": {
                "channel": "whatsapp",
                "templateId": "wa_recovery_2",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait3",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 480
            },
            "data": {
              "label": "Esperar até 360 min",
              "config": {
                "seconds": 13200
              }
            }
          },
          {
            "id": "guard3",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 480
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought3",
            "type": "end",
            "position": {
              "x": 0,
              "y": 640
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message3",
            "type": "message",
            "position": {
              "x": 280,
              "y": 640
            },
            "data": {
              "label": "Mensagem 4",
              "config": {
                "channel": "whatsapp",
                "templateId": "wa_recovery_3",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait4",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 640
            },
            "data": {
              "label": "Esperar até 1440 min",
              "config": {
                "seconds": 64800
              }
            }
          },
          {
            "id": "guard4",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 640
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought4",
            "type": "end",
            "position": {
              "x": 0,
              "y": 800
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message4",
            "type": "message",
            "position": {
              "x": 280,
              "y": 800
            },
            "data": {
              "label": "Mensagem 5",
              "config": {
                "channel": "whatsapp",
                "templateId": "wa_recovery_4",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait5",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 800
            },
            "data": {
              "label": "Esperar até 2880 min",
              "config": {
                "seconds": 86400
              }
            }
          },
          {
            "id": "guard5",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 800
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought5",
            "type": "end",
            "position": {
              "x": 0,
              "y": 960
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message5",
            "type": "message",
            "position": {
              "x": 280,
              "y": 960
            },
            "data": {
              "label": "Mensagem 6",
              "config": {
                "channel": "whatsapp",
                "templateId": "wa_recovery_5",
                "integrationId": null
              }
            }
          },
          {
            "id": "clear",
            "type": "tag",
            "position": {
              "x": 560,
              "y": 960
            },
            "data": {
              "label": "Finalizar recuperação",
              "config": {
                "operation": "remove",
                "tag": "recuperando:{{product_tag}}"
              }
            }
          },
          {
            "id": "end",
            "type": "end",
            "position": {
              "x": 840,
              "y": 960
            },
            "data": {
              "label": "Fim",
              "config": {}
            }
          }
        ],
        "edges": [
          {
            "id": "e0",
            "source": "start",
            "target": "tag"
          },
          {
            "id": "e1",
            "source": "tag",
            "target": "wait0"
          },
          {
            "id": "e2",
            "source": "wait0",
            "target": "guard0"
          },
          {
            "id": "e3",
            "source": "guard0",
            "target": "bought0",
            "sourceHandle": "yes"
          },
          {
            "id": "e4",
            "source": "guard0",
            "target": "message0",
            "sourceHandle": "no"
          },
          {
            "id": "e5",
            "source": "message0",
            "target": "wait1"
          },
          {
            "id": "e6",
            "source": "wait1",
            "target": "guard1"
          },
          {
            "id": "e7",
            "source": "guard1",
            "target": "bought1",
            "sourceHandle": "yes"
          },
          {
            "id": "e8",
            "source": "guard1",
            "target": "message1",
            "sourceHandle": "no"
          },
          {
            "id": "e9",
            "source": "message1",
            "target": "wait2"
          },
          {
            "id": "e10",
            "source": "wait2",
            "target": "guard2"
          },
          {
            "id": "e11",
            "source": "guard2",
            "target": "bought2",
            "sourceHandle": "yes"
          },
          {
            "id": "e12",
            "source": "guard2",
            "target": "message2",
            "sourceHandle": "no"
          },
          {
            "id": "e13",
            "source": "message2",
            "target": "wait3"
          },
          {
            "id": "e14",
            "source": "wait3",
            "target": "guard3"
          },
          {
            "id": "e15",
            "source": "guard3",
            "target": "bought3",
            "sourceHandle": "yes"
          },
          {
            "id": "e16",
            "source": "guard3",
            "target": "message3",
            "sourceHandle": "no"
          },
          {
            "id": "e17",
            "source": "message3",
            "target": "wait4"
          },
          {
            "id": "e18",
            "source": "wait4",
            "target": "guard4"
          },
          {
            "id": "e19",
            "source": "guard4",
            "target": "bought4",
            "sourceHandle": "yes"
          },
          {
            "id": "e20",
            "source": "guard4",
            "target": "message4",
            "sourceHandle": "no"
          },
          {
            "id": "e21",
            "source": "message4",
            "target": "wait5"
          },
          {
            "id": "e22",
            "source": "wait5",
            "target": "guard5"
          },
          {
            "id": "e23",
            "source": "guard5",
            "target": "bought5",
            "sourceHandle": "yes"
          },
          {
            "id": "e24",
            "source": "guard5",
            "target": "message5",
            "sourceHandle": "no"
          },
          {
            "id": "e25",
            "source": "message5",
            "target": "clear"
          },
          {
            "id": "e26",
            "source": "clear",
            "target": "end"
          }
        ]
      }
    },
    {
      "name": "MODELO • Recuperação — WhatsApp pagamento recusado 3 contatos",
      "source_id": null,
      "product_id": null,
      "recovery": true,
      "settings": {
        "sales_mode": "recovery",
        "max_messages": 3,
        "days": [
          1,
          2,
          3,
          4,
          5,
          6
        ],
        "allowed_start": 8,
        "allowed_end": 20,
        "time_zone": "America/Fortaleza",
        "folder": "templates"
      },
      "graph": {
        "schemaVersion": 1,
        "nodes": [
          {
            "id": "start",
            "type": "trigger",
            "position": {
              "x": 0,
              "y": 0
            },
            "data": {
              "label": "Início",
              "config": {
                "event": "payment.failed"
              }
            }
          },
          {
            "id": "tag",
            "type": "tag",
            "position": {
              "x": 280,
              "y": 0
            },
            "data": {
              "label": "Em recuperação",
              "config": {
                "operation": "add",
                "tag": "recuperando:{{product_tag}}"
              }
            }
          },
          {
            "id": "wait0",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 0
            },
            "data": {
              "label": "Esperar até 10 min",
              "config": {
                "seconds": 600
              }
            }
          },
          {
            "id": "guard0",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 0
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought0",
            "type": "end",
            "position": {
              "x": 0,
              "y": 160
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message0",
            "type": "message",
            "position": {
              "x": 280,
              "y": 160
            },
            "data": {
              "label": "Mensagem 1",
              "config": {
                "channel": "whatsapp",
                "templateId": "wa_recovery_0",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait1",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 160
            },
            "data": {
              "label": "Esperar até 20 min",
              "config": {
                "seconds": 600
              }
            }
          },
          {
            "id": "guard1",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 160
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought1",
            "type": "end",
            "position": {
              "x": 0,
              "y": 320
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message1",
            "type": "message",
            "position": {
              "x": 280,
              "y": 320
            },
            "data": {
              "label": "Mensagem 2",
              "config": {
                "channel": "whatsapp",
                "templateId": "wa_recovery_1",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait2",
            "type": "wait",
            "position": {
              "x": 560,
              "y": 320
            },
            "data": {
              "label": "Esperar até 1440 min",
              "config": {
                "seconds": 85200
              }
            }
          },
          {
            "id": "guard2",
            "type": "condition",
            "position": {
              "x": 840,
              "y": 320
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{product_tag}}"
              }
            }
          },
          {
            "id": "bought2",
            "type": "end",
            "position": {
              "x": 0,
              "y": 480
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message2",
            "type": "message",
            "position": {
              "x": 280,
              "y": 480
            },
            "data": {
              "label": "Mensagem 3",
              "config": {
                "channel": "whatsapp",
                "templateId": "wa_recovery_5",
                "integrationId": null
              }
            }
          },
          {
            "id": "clear",
            "type": "tag",
            "position": {
              "x": 560,
              "y": 480
            },
            "data": {
              "label": "Finalizar recuperação",
              "config": {
                "operation": "remove",
                "tag": "recuperando:{{product_tag}}"
              }
            }
          },
          {
            "id": "end",
            "type": "end",
            "position": {
              "x": 840,
              "y": 480
            },
            "data": {
              "label": "Fim",
              "config": {}
            }
          }
        ],
        "edges": [
          {
            "id": "e0",
            "source": "start",
            "target": "tag"
          },
          {
            "id": "e1",
            "source": "tag",
            "target": "wait0"
          },
          {
            "id": "e2",
            "source": "wait0",
            "target": "guard0"
          },
          {
            "id": "e3",
            "source": "guard0",
            "target": "bought0",
            "sourceHandle": "yes"
          },
          {
            "id": "e4",
            "source": "guard0",
            "target": "message0",
            "sourceHandle": "no"
          },
          {
            "id": "e5",
            "source": "message0",
            "target": "wait1"
          },
          {
            "id": "e6",
            "source": "wait1",
            "target": "guard1"
          },
          {
            "id": "e7",
            "source": "guard1",
            "target": "bought1",
            "sourceHandle": "yes"
          },
          {
            "id": "e8",
            "source": "guard1",
            "target": "message1",
            "sourceHandle": "no"
          },
          {
            "id": "e9",
            "source": "message1",
            "target": "wait2"
          },
          {
            "id": "e10",
            "source": "wait2",
            "target": "guard2"
          },
          {
            "id": "e11",
            "source": "guard2",
            "target": "bought2",
            "sourceHandle": "yes"
          },
          {
            "id": "e12",
            "source": "guard2",
            "target": "message2",
            "sourceHandle": "no"
          },
          {
            "id": "e13",
            "source": "message2",
            "target": "clear"
          },
          {
            "id": "e14",
            "source": "clear",
            "target": "end"
          }
        ]
      }
    },
    {
      "name": "MODELO • Upsell — E-mail 3 contatos",
      "source_id": null,
      "product_id": null,
      "recovery": false,
      "settings": {
        "sales_mode": "upsell",
        "max_messages": 3,
        "days": [
          1,
          2,
          3,
          4,
          5,
          6
        ],
        "allowed_start": 8,
        "allowed_end": 20,
        "time_zone": "America/Fortaleza",
        "folder": "templates"
      },
      "graph": {
        "schemaVersion": 1,
        "nodes": [
          {
            "id": "start",
            "type": "trigger",
            "position": {
              "x": 0,
              "y": 0
            },
            "data": {
              "label": "Início",
              "config": {
                "event": "payment.approved"
              }
            }
          },
          {
            "id": "wait0",
            "type": "wait",
            "position": {
              "x": 280,
              "y": 0
            },
            "data": {
              "label": "Esperar até 1 min",
              "config": {
                "seconds": 60
              }
            }
          },
          {
            "id": "guard0",
            "type": "condition",
            "position": {
              "x": 560,
              "y": 0
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{promotion_tag}}"
              }
            }
          },
          {
            "id": "bought0",
            "type": "end",
            "position": {
              "x": 840,
              "y": 0
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message0",
            "type": "message",
            "position": {
              "x": 0,
              "y": 160
            },
            "data": {
              "label": "Mensagem 1",
              "config": {
                "channel": "email",
                "templateId": "email_upsell_0",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait1",
            "type": "wait",
            "position": {
              "x": 280,
              "y": 160
            },
            "data": {
              "label": "Esperar até 720 min",
              "config": {
                "seconds": 43140
              }
            }
          },
          {
            "id": "guard1",
            "type": "condition",
            "position": {
              "x": 560,
              "y": 160
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{promotion_tag}}"
              }
            }
          },
          {
            "id": "bought1",
            "type": "end",
            "position": {
              "x": 840,
              "y": 160
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message1",
            "type": "message",
            "position": {
              "x": 0,
              "y": 320
            },
            "data": {
              "label": "Mensagem 2",
              "config": {
                "channel": "email",
                "templateId": "email_upsell_1",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait2",
            "type": "wait",
            "position": {
              "x": 280,
              "y": 320
            },
            "data": {
              "label": "Esperar até 1440 min",
              "config": {
                "seconds": 43200
              }
            }
          },
          {
            "id": "guard2",
            "type": "condition",
            "position": {
              "x": 560,
              "y": 320
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{promotion_tag}}"
              }
            }
          },
          {
            "id": "bought2",
            "type": "end",
            "position": {
              "x": 840,
              "y": 320
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message2",
            "type": "message",
            "position": {
              "x": 0,
              "y": 480
            },
            "data": {
              "label": "Mensagem 3",
              "config": {
                "channel": "email",
                "templateId": "email_upsell_2",
                "integrationId": null
              }
            }
          },
          {
            "id": "end",
            "type": "end",
            "position": {
              "x": 280,
              "y": 480
            },
            "data": {
              "label": "Fim",
              "config": {}
            }
          }
        ],
        "edges": [
          {
            "id": "e0",
            "source": "start",
            "target": "wait0"
          },
          {
            "id": "e1",
            "source": "wait0",
            "target": "guard0"
          },
          {
            "id": "e2",
            "source": "guard0",
            "target": "bought0",
            "sourceHandle": "yes"
          },
          {
            "id": "e3",
            "source": "guard0",
            "target": "message0",
            "sourceHandle": "no"
          },
          {
            "id": "e4",
            "source": "message0",
            "target": "wait1"
          },
          {
            "id": "e5",
            "source": "wait1",
            "target": "guard1"
          },
          {
            "id": "e6",
            "source": "guard1",
            "target": "bought1",
            "sourceHandle": "yes"
          },
          {
            "id": "e7",
            "source": "guard1",
            "target": "message1",
            "sourceHandle": "no"
          },
          {
            "id": "e8",
            "source": "message1",
            "target": "wait2"
          },
          {
            "id": "e9",
            "source": "wait2",
            "target": "guard2"
          },
          {
            "id": "e10",
            "source": "guard2",
            "target": "bought2",
            "sourceHandle": "yes"
          },
          {
            "id": "e11",
            "source": "guard2",
            "target": "message2",
            "sourceHandle": "no"
          },
          {
            "id": "e12",
            "source": "message2",
            "target": "end"
          }
        ]
      }
    },
    {
      "name": "MODELO • Upsell — WhatsApp 3 contatos",
      "source_id": null,
      "product_id": null,
      "recovery": false,
      "settings": {
        "sales_mode": "upsell",
        "max_messages": 3,
        "days": [
          1,
          2,
          3,
          4,
          5,
          6
        ],
        "allowed_start": 8,
        "allowed_end": 20,
        "time_zone": "America/Fortaleza",
        "folder": "templates"
      },
      "graph": {
        "schemaVersion": 1,
        "nodes": [
          {
            "id": "start",
            "type": "trigger",
            "position": {
              "x": 0,
              "y": 0
            },
            "data": {
              "label": "Início",
              "config": {
                "event": "payment.approved"
              }
            }
          },
          {
            "id": "wait0",
            "type": "wait",
            "position": {
              "x": 280,
              "y": 0
            },
            "data": {
              "label": "Esperar até 1 min",
              "config": {
                "seconds": 60
              }
            }
          },
          {
            "id": "guard0",
            "type": "condition",
            "position": {
              "x": 560,
              "y": 0
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{promotion_tag}}"
              }
            }
          },
          {
            "id": "bought0",
            "type": "end",
            "position": {
              "x": 840,
              "y": 0
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message0",
            "type": "message",
            "position": {
              "x": 0,
              "y": 160
            },
            "data": {
              "label": "Mensagem 1",
              "config": {
                "channel": "whatsapp",
                "templateId": "whatsapp_upsell_0",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait1",
            "type": "wait",
            "position": {
              "x": 280,
              "y": 160
            },
            "data": {
              "label": "Esperar até 720 min",
              "config": {
                "seconds": 43140
              }
            }
          },
          {
            "id": "guard1",
            "type": "condition",
            "position": {
              "x": 560,
              "y": 160
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{promotion_tag}}"
              }
            }
          },
          {
            "id": "bought1",
            "type": "end",
            "position": {
              "x": 840,
              "y": 160
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message1",
            "type": "message",
            "position": {
              "x": 0,
              "y": 320
            },
            "data": {
              "label": "Mensagem 2",
              "config": {
                "channel": "whatsapp",
                "templateId": "whatsapp_upsell_1",
                "integrationId": null
              }
            }
          },
          {
            "id": "wait2",
            "type": "wait",
            "position": {
              "x": 280,
              "y": 320
            },
            "data": {
              "label": "Esperar até 1440 min",
              "config": {
                "seconds": 43200
              }
            }
          },
          {
            "id": "guard2",
            "type": "condition",
            "position": {
              "x": 560,
              "y": 320
            },
            "data": {
              "label": "Já comprou?",
              "config": {
                "kind": "has_tag",
                "value": "{{promotion_tag}}"
              }
            }
          },
          {
            "id": "bought2",
            "type": "end",
            "position": {
              "x": 840,
              "y": 320
            },
            "data": {
              "label": "Já comprou: encerrar",
              "config": {}
            }
          },
          {
            "id": "message2",
            "type": "message",
            "position": {
              "x": 0,
              "y": 480
            },
            "data": {
              "label": "Mensagem 3",
              "config": {
                "channel": "whatsapp",
                "templateId": "whatsapp_upsell_2",
                "integrationId": null
              }
            }
          },
          {
            "id": "end",
            "type": "end",
            "position": {
              "x": 280,
              "y": 480
            },
            "data": {
              "label": "Fim",
              "config": {}
            }
          }
        ],
        "edges": [
          {
            "id": "e0",
            "source": "start",
            "target": "wait0"
          },
          {
            "id": "e1",
            "source": "wait0",
            "target": "guard0"
          },
          {
            "id": "e2",
            "source": "guard0",
            "target": "bought0",
            "sourceHandle": "yes"
          },
          {
            "id": "e3",
            "source": "guard0",
            "target": "message0",
            "sourceHandle": "no"
          },
          {
            "id": "e4",
            "source": "message0",
            "target": "wait1"
          },
          {
            "id": "e5",
            "source": "wait1",
            "target": "guard1"
          },
          {
            "id": "e6",
            "source": "guard1",
            "target": "bought1",
            "sourceHandle": "yes"
          },
          {
            "id": "e7",
            "source": "guard1",
            "target": "message1",
            "sourceHandle": "no"
          },
          {
            "id": "e8",
            "source": "message1",
            "target": "wait2"
          },
          {
            "id": "e9",
            "source": "wait2",
            "target": "guard2"
          },
          {
            "id": "e10",
            "source": "guard2",
            "target": "bought2",
            "sourceHandle": "yes"
          },
          {
            "id": "e11",
            "source": "guard2",
            "target": "message2",
            "sourceHandle": "no"
          },
          {
            "id": "e12",
            "source": "message2",
            "target": "end"
          }
        ]
      }
    }
  ]
};
const user = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(user || '')) throw Error('Informe o UUID da conta autorizada');
(async () => {
 const current = {};
 for (const table of ['aw_templates','aw_flows']) {
  const names = (table === 'aw_templates' ? pack.templates : pack.flows).map(item => item.name);
  current[table] = await connection.query(`SELECT id,name FROM ${table} WHERE user_id=$1 AND name=ANY($2::text[])`, [user,names]);
  if (new Set(current[table].map(item => item.name)).size !== current[table].length) throw Error('Há nomes duplicados; revisar antes de cadastrar');
 }
 if (!process.argv.includes('--apply')) { console.log(JSON.stringify({mode:'dry-run',templates:pack.templates.length,flows:pack.flows.length,existingTemplates:current.aw_templates.length,existingFlows:current.aw_flows.length}));return; }
 const protection=require('./dist/automation/workflows/purchase-target');
 if(typeof protection.promotionProduct!=='function' || typeof protection.salesTag!=='function')throw Error('Publique primeiro a versão com proteção de compra');
 const originalQuery=connection.query, originalOne=connection.queryOne;
 const result=await connection.transaction(async tx => {
  await tx('SELECT pg_advisory_xact_lock(hashtext($1))',['trafficai-sales-pack:'+user]);
  connection.query=tx;connection.queryOne=async(sql,args)=>(await tx(sql,args))[0]||null;
  try {
   const {saveTemplate}=require('./dist/automation/workflows/templates');
   const {saveFlow}=require('./dist/automation/workflows/repository');
   const ids={};const created={templates:[],flows:[]};
   for(const item of pack.templates){
    const prior=await tx('SELECT id FROM aw_templates WHERE user_id=$1 AND name=$2',[user,item.name]);
    if(prior.length>1)throw Error('Modelo duplicado');
    const row=prior[0]||await saveTemplate(user,item);ids[item.key]=row.id;
    if(!prior.length)created.templates.push({id:row.id,name:item.name});
   }
   for(const item of pack.flows){
    const prior=await tx('SELECT id FROM aw_flows WHERE user_id=$1 AND name=$2',[user,item.name]);
    if(prior.length>1)throw Error('Fluxo duplicado');if(prior.length)continue;
    const flow=JSON.parse(JSON.stringify(item));
    for(const n of flow.graph.nodes)if(n.type==='message')n.data.config.templateId=ids[n.data.config.templateId];
    const row=await saveFlow(user,flow);created.flows.push({id:row.id,name:row.name,status:row.status});
   }
   return created;
  } finally {connection.query=originalQuery;connection.queryOne=originalOne;}
 });
 console.log(JSON.stringify({mode:'installed_drafts_only',created:result},null,2));
})().then(()=>connection.pool.end()).catch(async e=>{console.error(e.message);await connection.pool.end();process.exitCode=1});
