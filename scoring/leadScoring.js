// LeadScoring - computes REDESIGN SCORE and LEAD SCORE, and qualifies
// leads into HIGH / MEDIUM / LOW / NOT A LEAD categories.
class LeadScoring {
  /**
   * @param analysis { scores: {design,mobile,ux,conversion,redesign}, problems[] }
   * @param contactAvailable boolean
   * @param commercialPotential number 0-100 (industry/context based)
   */
  score({ analysis, contactAvailable, commercialPotential = 70 }) {
    const scores = analysis.scores || {};
    const redesign = scores.redesign || 0;

    // Lower redesign score = higher redesign potential (the worse the site, the more they need us)
    const redesignPotential = Math.max(0, 100 - redesign);

    // Lead score = how likely this is a good lead for redesign services
    let leadScore = Math.round(
      redesignPotential * 0.5 +
      commercialPotential * 0.3 +
      (contactAvailable ? 20 : 0)
    );
    leadScore = Math.max(0, Math.min(100, leadScore));

    // Qualification
    let category = 'LOW';
    if (contactAvailable && leadScore >= 75) category = 'HIGH';
    else if (leadScore >= 60) category = 'MEDIUM';
    else if (contactAvailable || leadScore >= 40) category = 'LOW';
    else category = 'NOT_A_LEAD';

    // If contact missing, cap at MEDIUM max
    if (!contactAvailable && category === 'HIGH') category = 'MEDIUM';

    return {
      redesignScore: redesign,
      redesignPotential,
      leadScore,
      category,
      commercialPotential
    };
  }
}

module.exports = new LeadScoring();
