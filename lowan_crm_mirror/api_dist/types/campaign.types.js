"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_TRANSITIONS = void 0;
exports.VALID_TRANSITIONS = [
    { from: 'DRAFT', to: 'RUNNING', allowedRoles: ['ADMIN', 'OPERATOR'] },
    { from: 'DRAFT', to: 'SCHEDULED', allowedRoles: ['ADMIN', 'OPERATOR'] },
    { from: 'SCHEDULED', to: 'RUNNING', allowedRoles: ['ADMIN', 'OPERATOR'] },
    { from: 'RUNNING', to: 'PAUSED', allowedRoles: ['ADMIN', 'OPERATOR'] },
    { from: 'PAUSED', to: 'RUNNING', allowedRoles: ['ADMIN', 'OPERATOR'] },
];
//# sourceMappingURL=campaign.types.js.map